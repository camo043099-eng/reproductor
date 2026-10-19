package com.camo.onda;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaMetadataRetriever;
import android.media.audiofx.AudioEffect;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Virtualizer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Size;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Metadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.extractor.metadata.id3.TextInformationFrame;
import androidx.media3.extractor.metadata.vorbis.VorbisComment;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Puente entre la interfaz (web) y el reproductor nativo ExoPlayer. */
@UnstableApi
@CapacitorPlugin(name = "Motor", permissions = {
        @Permission(alias = "audio", strings = {"android.permission.READ_MEDIA_AUDIO"}),
        @Permission(alias = "almacen", strings = {"android.permission.READ_EXTERNAL_STORAGE"}),
        @Permission(alias = "notif", strings = {"android.permission.POST_NOTIFICATIONS"})
})
public class MotorPlugin extends Plugin {
    private final Handler h = new Handler(Looper.getMainLooper());
    private ExoPlayer escuchado = null;
    private final Map<String, double[]> rg = new HashMap<>();   // id → {pista, album} en dB (NaN si no hay)
    private String modoRg = "pista";
    private double preampDb = 0;
    private Runnable apagar = null;
    private Virtualizer virt = null;
    private BassBoost bass = null;
    private int sesionAudio = 0;
    private int envFuerza = 0, gravesFuerza = 0;
    private int fallosAudio = 0;
    private boolean sinEfectos = false;

    // ───────── utilidades ─────────
    private void ui(PluginCall call, Runnable r) {
        h.post(() -> {
            try { Motor.iniciar(getContext()); asegurar(); r.run(); }
            catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    private void asegurar() {
        if (escuchado == Motor.jugador) return;
        escuchado = Motor.jugador;
        escuchado.addListener(new Escucha());
        sesionAudio = 0; virt = null; bass = null; efectos();
    }
    private void servicio() { try { getContext().startService(new Intent(getContext(), MotorServicio.class)); } catch (Exception e) { /* en segundo plano no se puede arrancar */ } }
    private void anunciarSesion(boolean abrir) {                              // así Dolby y los efectos del sistema se pueden enganchar al audio de Onda
        try {
            Intent i = new Intent(abrir ? AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION : AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION);
            i.putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sesionAudio); i.putExtra(AudioEffect.EXTRA_PACKAGE_NAME, getContext().getPackageName()); i.putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC);
            getContext().sendBroadcast(i);
        } catch (Exception e) { /* opcional */ }
    }
    private void efectos() {
        ExoPlayer p = Motor.jugador; if (p == null) return; int id = p.getAudioSessionId();
        if (id == 0 || id == sesionAudio) return;
        try { if (virt != null) virt.release(); } catch (Exception e) { } try { if (bass != null) bass.release(); } catch (Exception e) { }
        virt = null; bass = null; sesionAudio = id;
        if (sinEfectos) return;
        try { virt = new Virtualizer(0, id); } catch (Throwable t) { virt = null; }
        try { bass = new BassBoost(0, id); } catch (Throwable t) { bass = null; }
        aplicarEfectos(); anunciarSesion(true);
    }
    private void aplicarEfectos() {
        try { if (virt != null && virt.getStrengthSupported()) { virt.setStrength((short) envFuerza); virt.setEnabled(envFuerza > 0); } } catch (Throwable t) { }
        try { if (bass != null && bass.getStrengthSupported()) { bass.setStrength((short) gravesFuerza); bass.setEnabled(gravesFuerza > 0); } } catch (Throwable t) { }
    }
    private void emitir(String nombre, JSObject datos) { notifyListeners(nombre, datos == null ? new JSObject() : datos); }
    private final Runnable tic = new Runnable() {
        @Override public void run() {
            ExoPlayer p = Motor.jugador;
            if (p != null && p.isPlaying()) {
                JSObject o = new JSObject(); o.put("pos", p.getCurrentPosition()); o.put("dur", p.getDuration() == C.TIME_UNSET ? -1 : p.getDuration()); o.put("indice", p.getCurrentMediaItemIndex());
                emitir("tiempo", o); h.postDelayed(this, 250);
            }
        }
    };
    private JSObject estadoActual() {
        ExoPlayer p = Motor.jugador; JSObject o = new JSObject();
        o.put("sonando", p != null && p.isPlaying()); o.put("indice", p == null ? -1 : p.getCurrentMediaItemIndex());
        o.put("pos", p == null ? 0 : p.getCurrentPosition()); o.put("dur", p == null || p.getDuration() == C.TIME_UNSET ? -1 : p.getDuration());
        o.put("estado", p == null ? 1 : p.getPlaybackState());
        return o;
    }
    private MediaItem item(JSONObject j) throws Exception {
        String albumId = j.optString("albumId", "");
        File f = new File(getContext().getFilesDir(), "portadas/" + albumId + ".jpg");
        Uri arte = f.exists() ? Uri.fromFile(f) : (albumId.isEmpty() ? null : Uri.parse("content://media/external/audio/albumart/" + albumId));
        MediaMetadata.Builder mb = new MediaMetadata.Builder().setTitle(j.optString("titulo", "")).setArtist(j.optString("artista", "")).setAlbumTitle(j.optString("album", ""));
        if (arte != null) mb.setArtworkUri(arte);
        return new MediaItem.Builder().setMediaId(j.getString("id")).setUri(Uri.parse(j.getString("uri"))).setMediaMetadata(mb.build()).build();
    }
    private List<MediaItem> items(JSArray a) throws Exception {
        List<MediaItem> l = new ArrayList<>(); for (int i = 0; i < a.length(); i++) l.add(item(a.getJSONObject(i))); return l;
    }
    private void aplicarGanancia() {
        ExoPlayer p = Motor.jugador; if (p == null) return;
        double db = 0; MediaItem it = p.getCurrentMediaItem();
        double[] g = it == null ? null : rg.get(it.mediaId);
        if (g != null && !"off".equals(modoRg)) {
            double pista = g[0], album = g[1];
            double v = "album".equals(modoRg) ? (Double.isNaN(album) ? pista : album) : (Double.isNaN(pista) ? album : pista);
            if (!Double.isNaN(v)) db = Math.min(v, 3);                        // sin conocer el pico, nunca sube más de +3 dB
        }
        Motor.eq.nucleo.ponerGananciaDb(db + preampDb);
    }
    private static double leerDb(String t) {
        if (t == null) return Double.NaN;
        try { return Double.parseDouble(t.toLowerCase(Locale.ROOT).replace("db", "").replace(",", ".").trim()); } catch (Exception e) { return Double.NaN; }
    }

    // ───────── escucha del reproductor ─────────
    private class Escucha implements Player.Listener {
        @Override public void onIsPlayingChanged(boolean sonando) {
            emitir("estado", estadoActual()); h.removeCallbacks(tic); if (sonando) { h.post(tic); servicio(); efectos(); anunciarSesion(true); } else anunciarSesion(false);
        }
        @Override public void onAudioSessionIdChanged(int id) { efectos(); }
        @Override public void onPlaybackStateChanged(int e) { emitir("estado", estadoActual()); }
        @Override public void onMediaItemTransition(MediaItem it, int motivo) {
            JSObject o = new JSObject(); o.put("indice", Motor.jugador.getCurrentMediaItemIndex()); o.put("id", it == null ? "" : it.mediaId); emitir("cambio", o);
            aplicarGanancia(); if (it != null) detallesAsync(it);
        }
        @Override public void onMetadata(Metadata m) {
            MediaItem it = Motor.jugador.getCurrentMediaItem(); if (it == null) return;
            double pista = Double.NaN, album = Double.NaN;
            for (int i = 0; i < m.length(); i++) {
                Metadata.Entry e = m.get(i);
                if (e instanceof VorbisComment) {
                    VorbisComment v = (VorbisComment) e; String k = v.key == null ? "" : v.key.toUpperCase(Locale.ROOT);
                    if (k.equals("REPLAYGAIN_TRACK_GAIN")) pista = leerDb(v.value); else if (k.equals("REPLAYGAIN_ALBUM_GAIN")) album = leerDb(v.value);
                } else if (e instanceof TextInformationFrame) {
                    TextInformationFrame t = (TextInformationFrame) e; String d = t.description == null ? "" : t.description.toUpperCase(Locale.ROOT);
                    String val = t.values.isEmpty() ? null : t.values.get(0);
                    if (d.equals("REPLAYGAIN_TRACK_GAIN")) pista = leerDb(val); else if (d.equals("REPLAYGAIN_ALBUM_GAIN")) album = leerDb(val);
                }
            }
            if (!Double.isNaN(pista) || !Double.isNaN(album)) {
                double[] g = rg.get(it.mediaId); if (g == null) g = new double[]{Double.NaN, Double.NaN};
                if (!Double.isNaN(pista)) g[0] = pista; if (!Double.isNaN(album)) g[1] = album; rg.put(it.mediaId, g); aplicarGanancia();
            }
        }
        @Override public void onTracksChanged(Tracks t) { }
        @Override public void onPlayWhenReadyChanged(boolean listo, int motivo) {
            if (motivo == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) { Motor.jugador.setPauseAtEndOfMediaItems(false); emitir("dormido", null); }
            else emitir("estado", estadoActual());
        }
        @Override public void onPlayerError(PlaybackException e) {
            int cod = e.errorCode;
            boolean deAudio = cod == PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED || cod == PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED
                    || cod == PlaybackException.ERROR_CODE_AUDIO_TRACK_OFFLOAD_INIT_FAILED || cod == PlaybackException.ERROR_CODE_AUDIO_TRACK_OFFLOAD_WRITE_FAILED;
            if (deAudio && fallosAudio < 2) {                              // el teléfono no aceptó el formato de salida: se reintenta de forma más sencilla
                fallosAudio++; ExoPlayer q = Motor.jugador;
                if (fallosAudio == 1) { EqProcesador.salida16 = true; getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).edit().putBoolean("salida16", true).apply(); }
                else { sinEfectos = true; try { if (virt != null) virt.release(); } catch (Exception x) { } try { if (bass != null) bass.release(); } catch (Exception x) { } virt = null; bass = null; }
                JSObject o = new JSObject(); o.put("mensaje", fallosAudio == 1 ? "Tu teléfono no aceptó el audio de 32 bits; cambié a 16 bits y sigo." : "Desactivé los efectos de sonido del sistema para poder reproducir."); emitir("error", o);
                long pos = q.getCurrentPosition(); int idx = q.getCurrentMediaItemIndex(); q.prepare(); q.seekTo(idx, pos); q.play(); return;
            }
            JSObject o = new JSObject(); o.put("mensaje", "No pude reproducir esta canción (" + e.getErrorCodeName() + ")."); emitir("error", o);
            ExoPlayer p = Motor.jugador; if (p.hasNextMediaItem()) { p.seekToNextMediaItem(); p.prepare(); p.play(); }
        }
    }

    // ───────── datos técnicos de la canción (frecuencia, bits) ─────────
    private void detallesAsync(MediaItem it) {
        final String id = it.mediaId; final Uri uri = it.localConfiguration == null ? null : it.localConfiguration.uri; if (uri == null) return;
        new Thread(() -> {
            int hz = 0, bits = 0, canales = 0, kbps = 0;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {      // FLAC: se lee del propio encabezado
                byte[] b = new byte[64]; int n = in == null ? 0 : in.read(b);
                int o = 0; if (n > 10 && b[0] == 'I' && b[1] == 'D' && b[2] == '3') o = -1;
                if (o == 0 && n >= 42 && b[0] == 'f' && b[1] == 'L' && b[2] == 'a' && b[3] == 'C') {
                    hz = ((b[18] & 0xFF) << 12) | ((b[19] & 0xFF) << 4) | ((b[20] & 0xF0) >> 4);
                    canales = ((b[20] & 0x0E) >> 1) + 1; bits = (((b[20] & 0x01) << 4) | ((b[21] & 0xF0) >> 4)) + 1;
                }
            } catch (Exception e) { /* se intenta de otra forma */ }
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(getContext(), uri);
                String br = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE); if (br != null) kbps = Integer.parseInt(br) / 1000;
                if (Build.VERSION.SDK_INT >= 31) {
                    String s = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE), bp = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITS_PER_SAMPLE);
                    if (hz == 0 && s != null) hz = Integer.parseInt(s); if (bits == 0 && bp != null) bits = Integer.parseInt(bp);
                }
            } catch (Exception e) { /* opcional */ } finally { try { r.release(); } catch (Exception e) { } }
            JSObject o = new JSObject(); o.put("id", id); o.put("sampleRate", hz); o.put("bits", bits); o.put("canales", canales); o.put("bitrate", kbps); emitir("detalles", o);
        }).start();
    }

    // ───────── permisos ─────────
    private String aliasAudio() { return Build.VERSION.SDK_INT >= 33 ? "audio" : "almacen"; }
    @PluginMethod public void permisos(PluginCall call) {
        if (getPermissionState(aliasAudio()) != PermissionState.GRANTED) requestPermissionForAlias(aliasAudio(), call, "trasAudio"); else pedirNotif(call);
    }
    @PermissionCallback private void trasAudio(PluginCall call) { pedirNotif(call); }
    private void pedirNotif(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notif") != PermissionState.GRANTED) requestPermissionForAlias("notif", call, "trasNotif"); else terminar(call);
    }
    @PermissionCallback private void trasNotif(PluginCall call) { terminar(call); }
    private void terminar(PluginCall call) { JSObject o = new JSObject(); o.put("audio", getPermissionState(aliasAudio()) == PermissionState.GRANTED); call.resolve(o); }

    // ───────── biblioteca (MediaStore: instantánea, sin copiar archivos) ─────────
    @PluginMethod public void escanear(PluginCall call) {
        new Thread(() -> {
            try {
                List<String> col = new ArrayList<>(java.util.Arrays.asList(
                        MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.ALBUM_ID,
                        MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.SIZE,
                        MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.DISPLAY_NAME));
                if (Build.VERSION.SDK_INT >= 29) col.add(MediaStore.Audio.Media.RELATIVE_PATH);
                if (Build.VERSION.SDK_INT >= 30) { col.add("album_artist"); col.add("disc_number"); }
                JSArray out = new JSArray();
                ContentResolver cr = getContext().getContentResolver();
                Map<Long, String> generos = mapaGeneros(cr);          // aparte: pedir el género en la consulta principal es muy lento en algunos teléfonos
                try (Cursor c = cr.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, col.toArray(new String[0]), "is_music != 0 OR mime_type LIKE '%flac%'", null, null)) {
                    if (c != null) while (c.moveToNext()) {
                        long id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                        long dur = c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)); if (dur <= 0) continue;
                        int tr = c.getInt(c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)); int disco = 0;
                        int ic = c.getColumnIndex("disc_number"); if (ic >= 0 && !c.isNull(ic)) { String d = c.getString(ic); if (d != null) try { disco = Integer.parseInt(d.split("/")[0].trim()); } catch (Exception e) { } }
                        if (tr >= 1000) { if (disco == 0) disco = tr / 1000; tr = tr % 1000; }
                        JSObject f = new JSObject();
                        f.put("id", "ms" + id); f.put("uri", android.content.ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id).toString());
                        f.put("titulo", limpio(c, MediaStore.Audio.Media.TITLE)); f.put("artista", limpio(c, MediaStore.Audio.Media.ARTIST));
                        f.put("albumArtista", limpio(c, "album_artist")); f.put("album", limpio(c, MediaStore.Audio.Media.ALBUM)); f.put("albumId", String.valueOf(c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID))));
                        f.put("genero", generos.containsKey(id) ? generos.get(id) : ""); f.put("pista", tr); f.put("disco", disco); f.put("anio", c.getInt(c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)));
                        f.put("duracion", dur / 1000.0); f.put("tam", c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE))); f.put("fecha", c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)) * 1000);
                        f.put("mime", limpio(c, MediaStore.Audio.Media.MIME_TYPE)); f.put("nombre", limpio(c, MediaStore.Audio.Media.DISPLAY_NAME)); f.put("carpeta", limpio(c, "relative_path"));
                        out.put(f);
                    }
                }
                JSObject o = new JSObject(); o.put("canciones", out); call.resolve(o);
            } catch (SecurityException e) { call.reject("permiso"); }
            catch (Exception e) { call.reject("No pude leer la música: " + e.getMessage()); }
        }).start();
    }
    private static Map<Long, String> mapaGeneros(ContentResolver cr) {
        Map<Long, String> m = new HashMap<>();
        try (Cursor g = cr.query(MediaStore.Audio.Genres.EXTERNAL_CONTENT_URI, new String[]{MediaStore.Audio.Genres._ID, MediaStore.Audio.Genres.NAME}, null, null, null)) {
            while (g != null && g.moveToNext()) {
                long gid = g.getLong(0); String nombre = g.getString(1); if (nombre == null || nombre.isEmpty()) continue;
                try (Cursor mm = cr.query(MediaStore.Audio.Genres.Members.getContentUri("external", gid), new String[]{MediaStore.Audio.Genres.Members.AUDIO_ID}, null, null, null)) {
                    while (mm != null && mm.moveToNext()) m.put(mm.getLong(0), nombre);
                } catch (Exception e) { /* este género se omite */ }
            }
        } catch (Exception e) { /* sin géneros */ }
        return m;
    }
    private static String limpio(Cursor c, String col) {
        int i = c.getColumnIndex(col); if (i < 0 || c.isNull(i)) return "";
        String s = c.getString(i); return s == null || s.equals("<unknown>") ? "" : s;
    }
    @PluginMethod public void portada(PluginCall call) {
        new Thread(() -> {
            String albumId = call.getString("albumId", ""), uri = call.getString("uri", "");
            File dir = new File(getContext().getFilesDir(), "portadas"); dir.mkdirs(); File f = new File(dir, albumId + ".jpg");
            JSObject o = new JSObject();
            if (f.exists()) { o.put("ruta", f.getAbsolutePath()); call.resolve(o); return; }
            Bitmap b = null;
            try { if (Build.VERSION.SDK_INT >= 29) b = getContext().getContentResolver().loadThumbnail(Uri.parse(uri), new Size(480, 480), null); } catch (Exception e) { /* se prueba otra forma */ }
            if (b == null) {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                try { r.setDataSource(getContext(), Uri.parse(uri)); byte[] d = r.getEmbeddedPicture(); if (d != null) b = BitmapFactory.decodeByteArray(d, 0, d.length); }
                catch (Exception e) { /* sin portada */ } finally { try { r.release(); } catch (Exception e) { } }
            }
            if (b != null) { try (FileOutputStream w = new FileOutputStream(f)) { b.compress(Bitmap.CompressFormat.JPEG, 88, w); o.put("ruta", f.getAbsolutePath()); } catch (Exception e) { /* sin portada */ } }
            call.resolve(o);
        }).start();
    }

    // ───────── salida de audio propia de Onda (Bluetooth, parlante del teléfono, cable, USB) ─────────
    private static boolean tipoUtil(int t) { return t == 2 || t == 3 || t == 4 || t == 8 || t == 9 || t == 11 || t == 22 || t == 26 || t == 27; }
    private AudioDeviceInfo[] salidasDisponibles() { return ((AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE)).getDevices(AudioManager.GET_DEVICES_OUTPUTS); }
    @PluginMethod public void salidas(PluginCall call) {
        ui(call, () -> {
            JSArray a = new JSArray(); boolean parlante = false;
            for (AudioDeviceInfo d : salidasDisponibles()) {
                int t = d.getType(); if (!tipoUtil(t)) continue; if (t == 2) { if (parlante) continue; parlante = true; }
                JSObject o = new JSObject(); o.put("tipo", t); o.put("nombre", d.getProductName() == null ? "" : d.getProductName().toString()); a.put(o);
            }
            JSObject r = new JSObject(); r.put("salidas", a); call.resolve(r);
        });
    }
    @PluginMethod public void salida(PluginCall call) {
        ui(call, () -> {
            int tipo = call.getInt("tipo", -1); String nombre = call.getString("nombre", ""); AudioDeviceInfo sel = null;
            if (tipo >= 0) for (AudioDeviceInfo d : salidasDisponibles()) {
                if (d.getType() != tipo) continue;
                String n = d.getProductName() == null ? "" : d.getProductName().toString();
                if (sel == null || n.equals(nombre)) sel = d;
            }
            Motor.jugador.setPreferredAudioDevice(sel);
            JSObject r = new JSObject(); r.put("activa", sel != null); call.resolve(r);
        });
    }

    // ───────── internet (portadas y letras): solo a servicios de la lista ─────────
    private static final String[] PERMITIDOS = {"itunes.apple.com", "mzstatic.com", "api.deezer.com", "dzcdn.net", "lrclib.net", "musicbrainz.org", "coverartarchive.org", "archive.org"};
    private static boolean permitido(String direccion) {
        try {
            URL u = new URL(direccion); if (!"https".equals(u.getProtocol())) return false; String host = u.getHost().toLowerCase(Locale.ROOT);
            for (String p : PERMITIDOS) if (host.equals(p) || host.endsWith("." + p)) return true;
        } catch (Exception e) { /* dirección inválida */ }
        return false;
    }
    private static byte[] bajar(String direccion, int max) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(direccion).openConnection();
        c.setRequestProperty("User-Agent", "Onda/0.4 (reproductor personal; github.com/camo043099-eng/reproductor)"); c.setConnectTimeout(8000); c.setReadTimeout(15000);
        int codigo = c.getResponseCode(); InputStream in = codigo < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] t = new byte[1 << 14]; int n;
        while (in != null && (n = in.read(t)) > 0) { b.write(t, 0, n); if (b.size() > max) throw new Exception("respuesta demasiado grande"); }
        if (codigo >= 400) throw new Exception("http " + codigo);
        return b.toByteArray();
    }
    @PluginMethod public void texto(PluginCall call) {
        new Thread(() -> {
            String u = call.getString("url", "");
            if (!permitido(u)) { call.reject("dirección no permitida"); return; }
            try { JSObject o = new JSObject(); o.put("codigo", 200); o.put("cuerpo", new String(bajar(u, 4 << 20), "UTF-8")); call.resolve(o); }
            catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }
    @PluginMethod public void descargar(PluginCall call) {
        new Thread(() -> {
            String u = call.getString("url", ""), albumId = call.getString("albumId", "x").replaceAll("[^A-Za-z0-9_]", "_");
            if (!permitido(u)) { call.reject("dirección no permitida"); return; }
            try {
                byte[] d = bajar(u, 12 << 20); Bitmap b = BitmapFactory.decodeByteArray(d, 0, d.length); if (b == null) throw new Exception("la imagen no se pudo leer");
                File dir = new File(getContext().getFilesDir(), "portadas"); dir.mkdirs(); File f = new File(dir, albumId + ".jpg");
                try (FileOutputStream w = new FileOutputStream(f)) { b.compress(Bitmap.CompressFormat.JPEG, 90, w); }
                JSObject o = new JSObject(); o.put("ruta", f.getAbsolutePath()); call.resolve(o);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }

    // ───────── reproducción ─────────
    @PluginMethod public void cargar(PluginCall call) {
        ui(call, () -> {
            try {
                ExoPlayer p = Motor.jugador; JSArray a = call.getArray("items"); int idx = call.getInt("indice", 0); long pos = call.getData().optLong("posMs", 0);
                boolean sonar = call.getBoolean("sonar", true);
                p.setMediaItems(items(a), idx, pos); p.prepare(); p.setPlayWhenReady(sonar);
                servicio();
                aplicarGanancia(); call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void alternar(PluginCall call) { ui(call, () -> { ExoPlayer p = Motor.jugador; if (p.isPlaying()) p.pause(); else { if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0, 0); p.play(); } call.resolve(); }); }
    @PluginMethod public void pausa(PluginCall call) { ui(call, () -> { Motor.jugador.pause(); call.resolve(); }); }
    @PluginMethod public void siguiente(PluginCall call) { ui(call, () -> { ExoPlayer p = Motor.jugador; if (p.hasNextMediaItem()) p.seekToNextMediaItem(); else p.seekTo(0, 0); p.play(); call.resolve(); }); }
    @PluginMethod public void anterior(PluginCall call) { ui(call, () -> { Motor.jugador.seekToPrevious(); call.resolve(); }); }
    @PluginMethod public void irA(PluginCall call) { ui(call, () -> { ExoPlayer p = Motor.jugador; p.seekTo(call.getInt("indice", 0), 0); p.play(); call.resolve(); }); }
    @PluginMethod public void buscar(PluginCall call) { ui(call, () -> { Motor.jugador.seekTo(call.getData().optLong("ms", 0)); call.resolve(); }); }
    @PluginMethod public void repetir(PluginCall call) {
        ui(call, () -> { String m = call.getString("modo", "no"); Motor.jugador.setRepeatMode("uno".equals(m) ? Player.REPEAT_MODE_ONE : "todo".equals(m) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF); call.resolve(); });
    }
    @PluginMethod public void velocidad(PluginCall call) { ui(call, () -> { Motor.jugador.setPlaybackParameters(new PlaybackParameters(call.getFloat("v", 1f), 1f)); call.resolve(); }); }
    @PluginMethod public void insertar(PluginCall call) {
        ui(call, () -> { try { ExoPlayer p = Motor.jugador; p.addMediaItem(Math.min(call.getInt("indice", 0), p.getMediaItemCount()), item(call.getObject("item"))); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); } });
    }
    @PluginMethod public void quitar(PluginCall call) { ui(call, () -> { Motor.jugador.removeMediaItem(call.getInt("indice", 0)); call.resolve(); }); }
    @PluginMethod public void mover(PluginCall call) { ui(call, () -> { Motor.jugador.moveMediaItem(call.getInt("de", 0), call.getInt("a", 0)); call.resolve(); }); }
    /** Reordena la cola sin cortar la canción que suena (modo aleatorio). */
    @PluginMethod public void reordenar(PluginCall call) {
        ui(call, () -> {
            try {
                ExoPlayer p = Motor.jugador; int idx = call.getInt("indice", 0); List<MediaItem> todos = items(call.getArray("items"));
                int cur = p.getCurrentMediaItemIndex(), n = p.getMediaItemCount();
                if (cur < 0 || n == 0) { call.resolve(); return; }
                if (cur + 1 < n) p.removeMediaItems(cur + 1, n);
                if (cur > 0) p.removeMediaItems(0, cur);
                if (idx + 1 < todos.size()) p.addMediaItems(todos.subList(idx + 1, todos.size()));
                if (idx > 0) p.addMediaItems(0, todos.subList(0, idx));
                call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void estado(PluginCall call) {
        ui(call, () -> {
            JSObject o = estadoActual(); JSArray ids = new JSArray(); ExoPlayer p = Motor.jugador;
            for (int i = 0; i < p.getMediaItemCount(); i++) ids.put(p.getMediaItemAt(i).mediaId);
            o.put("ids", ids); call.resolve(o);
        });
    }

    // ───────── sonido ─────────
    @PluginMethod public void eq(PluginCall call) {
        ui(call, () -> {
            try {
                JSArray b = call.getArray("bandas"); double[] db = new double[10]; for (int i = 0; i < 10 && i < b.length(); i++) db[i] = b.getDouble(i);
                Motor.eq.nucleo.ponerBandas(db, call.getBoolean("on", true)); preampDb = call.getData().optDouble("pre", 0); aplicarGanancia(); call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void espacial(PluginCall call) {
        ui(call, () -> {
            Motor.eq.nucleo.ponerAncho(call.getData().optDouble("ancho", 0));
            envFuerza = Math.max(0, Math.min(1000, call.getInt("env", 0))); gravesFuerza = Math.max(0, Math.min(1000, call.getInt("graves", 0)));
            efectos(); aplicarEfectos(); call.resolve();
        });
    }
    @PluginMethod public void capacidades(PluginCall call) {
        ui(call, () -> {
            efectos(); JSObject o = new JSObject();
            boolean v = false, b = false;
            try { v = virt != null && virt.getStrengthSupported(); } catch (Throwable t) { } try { b = bass != null && bass.getStrengthSupported(); } catch (Throwable t) { }
            o.put("envolvente", v); o.put("graves", b); o.put("sesion", sesionAudio); call.resolve(o);
        });
    }
    @PluginMethod public void efectosSistema(PluginCall call) {
        ui(call, () -> {
            efectos();
            try {
                Intent i = new Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL);
                i.putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sesionAudio); i.putExtra(AudioEffect.EXTRA_PACKAGE_NAME, getContext().getPackageName()); i.putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC);
                getActivity().startActivity(i); call.resolve();
            } catch (Exception e) { call.reject("sin panel"); }
        });
    }
    @PluginMethod public void rg(PluginCall call) { ui(call, () -> { modoRg = call.getString("modo", "pista"); aplicarGanancia(); call.resolve(); }); }

    // ───────── temporizador de sueño ─────────
    private void cancelarSueno() {
        if (apagar != null) { h.removeCallbacks(apagar); apagar = null; }
        ExoPlayer p = Motor.jugador; if (p != null) { p.setPauseAtEndOfMediaItems(false); p.setVolume(1f); }
    }
    @PluginMethod public void dormir(PluginCall call) {
        ui(call, () -> {
            cancelarSueno(); ExoPlayer p = Motor.jugador;
            if (call.getBoolean("cancion", false)) { p.setPauseAtEndOfMediaItems(true); call.resolve(); return; }
            double min = call.getData().optDouble("minutos", 0); if (min <= 0) { call.resolve(); return; }
            apagar = new Runnable() {
                int paso = 0;
                @Override public void run() {
                    ExoPlayer q = Motor.jugador; if (q == null) return; paso++;
                    if (paso < 30) { q.setVolume(1f - paso / 30f); h.postDelayed(this, 200); }
                    else { q.pause(); q.setVolume(1f); apagar = null; emitir("dormido", null); }
                }
            };
            h.postDelayed(apagar, (long) (min * 60000) - 6000 > 0 ? (long) (min * 60000) - 6000 : 0);
            call.resolve();
        });
    }
}
