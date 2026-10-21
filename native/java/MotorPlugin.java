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
    private ExoPlayer escuchado = null; private Player.Listener escucha = null;
    private final Map<String, double[]> rg = new HashMap<>();   // id → {pista, album} en dB (NaN si no hay)
    private String modoRg = "pista";
    private double preampDb = 0; private double gananciaAplicadaDb = 0;
    private Runnable apagar = null;
    private Virtualizer virt = null;
    private BassBoost bass = null;
    private int sesionAudio = 0;
    private int envFuerza = 0, gravesFuerza = 0;
    private int fallosAudio = 0;
    private boolean ritmoOn = false;
    private int brechaMs = 0; private int brechaTok = 0; private boolean finCancionSueno = false;
    private void brechaOn() { ExoPlayer p = Motor.jugador; if (p != null && brechaMs > 0 && !finCancionSueno) p.setPauseAtEndOfMediaItems(true); }
    @PluginMethod public void transiciones(PluginCall call) {
        ui(call, () -> {
            Motor.fadeMs = Math.max(0, Math.min(2000, call.getData().optInt("fadeMs", 0)));
            brechaMs = Math.max(0, Math.min(10000, call.getData().optInt("brechaMs", 0)));
            if (Motor.fadeMs == 0 && !Motor.rampaActiva()) { Motor.fTransp = 1f; Motor.mezclar(); }
            if (!finCancionSueno) Motor.jugador.setPauseAtEndOfMediaItems(brechaMs > 0);
            call.resolve();
        });
    }
    // ── mezcla entre canciones (experimental) ──
    private int cruceMs = 0; private boolean cruzando = false; private long cruceT0 = 0, cruceIni = 0; private int cruceDur = 0, cruceIdxA = -1, cruceIdxB = -1;
    @PluginMethod public void cruce(PluginCall call) {
        ui(call, () -> { cruceMs = Math.max(0, Math.min(12000, (int) Math.round(call.getData().optDouble("seg", 0) * 1000))); if (cruceMs == 0) cruceCancelar(); call.resolve(); });
    }
    private void cruceCancelar() { if (cruzando || Motor.jugadorB != null) { cruzando = false; Motor.abortarCruce(); } }
    private void cruceRevisar(ExoPlayer p, long pos, long dur) {
        if (cruzando) {
            ExoPlayer b = Motor.jugadorB;
            if (b == null || b.getPlayerError() != null || !p.getPlayWhenReady()) { cruceCancelar(); return; }
            int idx = p.getCurrentMediaItemIndex();
            if (idx != cruceIdxA) { if (idx == cruceIdxB) cruceTerminar(); else cruceCancelar(); return; }   // el primero ya pasó a la siguiente (o el usuario saltó a otra)
            long ahora = android.os.SystemClock.uptimeMillis();
            if (cruceT0 == 0) {                                                  // se espera a que el segundo suene de verdad para empezar a mezclar
                if (b.isPlaying()) cruceT0 = ahora; else if (ahora - cruceIni > 2500) cruceCancelar();
                return;
            }
            float x = Math.min(1f, (ahora - cruceT0) / (float) cruceDur);
            Motor.fFund = (float) Math.cos(x * Math.PI / 2); Motor.mezclar(); b.setVolume((float) Math.sin(x * Math.PI / 2));   // potencia constante: no se nota un bajón a la mitad
            if (x >= 1f) cruceTerminar();
            return;
        }
        if (cruceMs <= 0 || fadeSueno || finCancionSueno || brechaMs > 0 || Motor.jugadorB != null) return;
        if (p.getRepeatMode() == Player.REPEAT_MODE_ONE || !p.hasNextMediaItem() || dur == C.TIME_UNSET || dur < cruceMs * 3L) return;
        long falta = dur - pos; if (falta > cruceMs + 500 || falta < 1500) return;
        int sig = p.getNextMediaItemIndex(); if (sig < 0) return;
        ExoPlayer b = Motor.crearCruce();
        List<MediaItem> todos = new ArrayList<>(); for (int i = 0; i < p.getMediaItemCount(); i++) todos.add(p.getMediaItemAt(i));
        b.setMediaItems(todos, sig, 0);
        b.setRepeatMode(p.getRepeatMode()); b.setShuffleModeEnabled(p.getShuffleModeEnabled()); b.setPlaybackParameters(p.getPlaybackParameters()); b.setPauseAtEndOfMediaItems(p.getPauseAtEndOfMediaItems());
        Motor.eqB.nucleo.ponerGananciaDb(gananciaDeItem(p.getMediaItemAt(sig)) + preampDb);
        b.setVolume(0f); b.prepare(); b.play();
        cruzando = true; cruceT0 = 0; cruceIni = android.os.SystemClock.uptimeMillis(); cruceIdxA = p.getCurrentMediaItemIndex(); cruceIdxB = sig; cruceDur = (int) Math.max(800, Math.min(cruceMs, falta - 400));
    }
    private void cruceTerminar() {
        cruzando = false; ExoPlayer b = Motor.jugadorB; if (b == null) return;
        try {
            Motor.intercambiar(); asegurar(); aplicarGanancia();
            MediaItem it = Motor.jugador.getCurrentMediaItem();
            JSObject o = new JSObject(); o.put("indice", Motor.jugador.getCurrentMediaItemIndex()); o.put("id", it == null ? "" : it.mediaId); emitir("cambio", o);
            emitir("estado", estadoActual()); if (it != null) detallesAsync(it);
            h.removeCallbacks(tic); h.post(tic);
        } catch (Throwable t) { Motor.abortarCruce(); }
    }
    private int fundidoMs = 0; private boolean fadeSueno = false; private long ultimaEmision = 0;
    private android.media.AudioDeviceCallback cbRuta = null;
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
        if (escuchado != null && escucha != null) { try { escuchado.removeListener(escucha); } catch (Throwable t) { /* el reproductor anterior ya no existe */ } }
        escuchado = Motor.jugador; escucha = new Escucha();
        escuchado.addListener(escucha);
        sesionAudio = 0; virt = null; bass = null; efectos();
        emitir("estado", estadoActual());                                   // la pantalla nueva se entera de si ya está sonando
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
                // red de seguridad: si por cualquier motivo el volumen interno quedó bajo sin que nada lo esté moviendo, se restablece
                if (!Motor.rampaActiva() && Motor.fTransp < 1f) { Motor.fTransp = 1f; Motor.mezclar(); }
                if (!fadeSueno && apagar == null && Motor.fSueno < 1f) { Motor.fSueno = 1f; Motor.mezclar(); }
                if (fundidoMs == 0 && !cruzando && Motor.fFund < 1f) { Motor.fFund = 1f; Motor.mezclar(); }
                long ahora = android.os.SystemClock.uptimeMillis(), pos = p.getCurrentPosition(), dur = p.getDuration();
                boolean enFundido = false;
                if (fundidoMs > 0 && !fadeSueno && cruceMs == 0) {                       // fundido: el final de una canción baja suave y la siguiente sube suave
                    float v = 1f;
                    if (dur != C.TIME_UNSET && dur > fundidoMs * 3L) { long falta = dur - pos; if (falta < fundidoMs) v = Math.min(v, curva(falta / (float) fundidoMs)); }
                    if (pos < fundidoMs) v = Math.min(v, curva(pos / (float) fundidoMs));
                    Motor.fFund = v; Motor.mezclar(); enFundido = v < 1f;
                }
                if (cruceMs > 0 || cruzando) { try { cruceRevisar(p, pos, dur); } catch (Throwable t) { cruceCancelar(); } enFundido = enFundido || cruzando; }
                if (ahora - ultimaEmision >= 240) {
                    ultimaEmision = ahora;
                    JSObject o = new JSObject(); o.put("pos", pos); o.put("dur", dur == C.TIME_UNSET ? -1 : dur); o.put("indice", p.getCurrentMediaItemIndex()); emitir("tiempo", o);
                }
                h.postDelayed(this, enFundido ? 60 : 250);
            }
        }
    };
    private final Runnable ritmoTic = new Runnable() {
        @Override public void run() {
            ExoPlayer p = Motor.jugador;
            if (!ritmoOn || p == null || !p.isPlaying()) return;
            JSObject o = new JSObject(); o.put("b", EqProcesador.nivelBajo); o.put("r", EqProcesador.nivelTotal); com.getcapacitor.JSArray xs = new com.getcapacitor.JSArray(); for (float v : EqProcesador.bandas) xs.put(Double.valueOf(v)); o.put("x", xs); emitir("nivel", o);
            h.postDelayed(this, 45);
        }
    };
    @PluginMethod public void ritmo(PluginCall call) {
        ui(call, () -> { ritmoOn = call.getBoolean("on", false); EqProcesador.medir = ritmoOn; h.removeCallbacks(ritmoTic); if (ritmoOn) h.post(ritmoTic); call.resolve(); });
    }
    /** qué pasa con la música al cerrar la app desde recientes */
    // ── que el teléfono no cierre la música al quitar la app de recientes ──
    @PluginMethod public void bateria(PluginCall call) {
        ui(call, () -> {
            Context c = getContext(); String pkg = c.getPackageName(); boolean ok = false;
            try {
                android.os.PowerManager pm = (android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                    Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); ok = true;
                }
            } catch (Throwable t) { ok = false; }
            JSObject o = new JSObject(); o.put("yaLibre", !ok && Build.VERSION.SDK_INT >= 23 && c.getSystemService(Context.POWER_SERVICE) != null && ((android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(pkg));
            if (!ok && !o.optBoolean("yaLibre", false)) { try { Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); } catch (Throwable t) { /* sin pantalla */ } }
            call.resolve(o);
        });
    }
    @PluginMethod public void autoinicio(PluginCall call) {
        ui(call, () -> {
            boolean ok = false; Context c = getContext();
            String[][] destinos = {{"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"}, {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"}, {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"}, {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"}};
            for (String[] d : destinos) { try { Intent i = new Intent(); i.setClassName(d[0], d[1]); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); ok = true; break; } catch (Throwable t) { /* ese fabricante no es */ } }
            JSObject o = new JSObject(); o.put("ok", ok); call.resolve(o);
        });
    }
    @PluginMethod public void alCerrar(PluginCall call) {
        getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).edit().putBoolean("detener", call.getBoolean("detener", false)).apply(); call.resolve();
    }
    /** realce de brillo para MP3/AAC de poca calidad (0 = apagado) */
    // Icono de la app por temporada: activa solo un alias de la actividad de inicio (ver native/icono/manifiesto.py)
    @PluginMethod public void icono(PluginCall call) {
        try {
            String elegido = call.getString("nombre", "normal");
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            for (String n : new String[]{"normal", "halloween", "navidad", "verano"}) {
                android.content.ComponentName cn = new android.content.ComponentName(pkg, pkg + ".Icono_" + n);
                boolean debe = n.equals(elegido);
                int ahora = pm.getComponentEnabledSetting(cn);
                boolean activo = ahora == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    || (ahora == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && n.equals("normal"));
                if (activo != debe) pm.setComponentEnabledSetting(cn, debe
                    ? android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    : android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    android.content.pm.PackageManager.DONT_KILL_APP);
            }
            JSObject r = new JSObject(); r.put("nombre", elegido); call.resolve(r);
        } catch (Throwable e) { call.reject("icono: " + e.getMessage()); }
    }
    @PluginMethod public void reverb(PluginCall call) {
        try { if (Motor.eq != null) Motor.eq.nucleo.ponerReverb(call.getDouble("mezcla", 0.0), call.getDouble("tam", 0.5), call.getDouble("amort", 0.5), call.getDouble("pre", 0.0)); call.resolve(); } catch (Throwable e) { call.resolve(); }
    }
    @PluginMethod public void mono(PluginCall call) {
        try { if (Motor.eq != null) Motor.eq.nucleo.ponerMono(call.getBoolean("on", false)); call.resolve(); } catch (Throwable e) { call.resolve(); }
    }
    /** Volumen del sistema para la música: "pasos" enteros sobre la escala de Android (positivo sube, negativo baja) */
    @PluginMethod public void volumen(PluginCall call) {
        try {
            android.media.AudioManager am = (android.media.AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
            int tipo = android.media.AudioManager.STREAM_MUSIC;
            int max = am.getStreamMaxVolume(tipo), cur = am.getStreamVolume(tipo);
            int nuevo = Math.max(0, Math.min(max, cur + (int) Math.round(call.getDouble("pasos", 0.0))));
            if (nuevo != cur) am.setStreamVolume(tipo, nuevo, 0);
            call.resolve();
        } catch (Throwable e) { call.resolve(); }
    }
    @PluginMethod public void realce(PluginCall call) {
        try { if (Motor.eq != null) Motor.eq.nucleo.ponerRealce(call.getDouble("mezcla", 0.0)); call.resolve(); } catch (Throwable e) { call.resolve(); }
    }
    /** Crossfeed para auriculares cerrados (IEM): mezcla de 0 a 0,6 de graves y medios del canal opuesto */
    @PluginMethod public void crossfeed(PluginCall call) {
        try {
            double m = call.getDouble("mezcla", 0.0);
            if (Motor.eq != null) Motor.eq.nucleo.ponerCrossfeed(m);
            if (Motor.eqB != null) Motor.eqB.nucleo.ponerCrossfeed(m);   // por si hay una mezcla entre canciones en curso
            call.resolve();
        } catch (Throwable e) { call.resolve(); }
    }
    /** Invierte la fase de toda la señal (rips de vinilo antiguos) */
    @PluginMethod public void fase(PluginCall call) {
        try {
            boolean on = call.getBoolean("on", false);
            if (Motor.eq != null) Motor.eq.nucleo.ponerFaseInvertida(on);
            if (Motor.eqB != null) Motor.eqB.nucleo.ponerFaseInvertida(on);
            call.resolve();
        } catch (Throwable e) { call.resolve(); }
    }
    /** Hi-Res puro: se guarda y se aplica al volver a abrir la app (el reproductor se crea una sola vez) */
    @PluginMethod public void hiResPuro(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).edit().putBoolean("hires", on).apply(); call.resolve();
    }
    /** diagnóstico en vivo (se consulta cada segundo desde Ajustes → Audio): ¿el DSP recibe audio ahora? */
    @PluginMethod public void diagnostico(PluginCall call) {
        ui(call, () -> {
            JSObject o = new JSObject();
            o.put("configurado", EqProcesador.configurado);
            o.put("entrada", EqProcesador.entradaTxt);
            o.put("salida", EqProcesador.salida16 ? "16-bit PCM" : "32-bit Float");
            o.put("bloques", EqProcesador.bloques);
            o.put("msDesdeBloque", EqProcesador.ultimoBloque == 0 ? -1 : System.currentTimeMillis() - EqProcesador.ultimoBloque);
            o.put("sonando", Motor.jugador != null && Motor.jugador.isPlaying());
            o.put("hiResPuro", getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("hires", false));
            call.resolve(o);
        });
    }
    /** datos reales del procesamiento para la pantalla de información de audio */
    @PluginMethod public void infoAudio(PluginCall call) {
        JSObject o = new JSObject();
        boolean activo = System.currentTimeMillis() - EqProcesador.ultimoBloque < 3000;
        o.put("procesando", activo); o.put("entrada", EqProcesador.entradaTxt); o.put("hz", EqProcesador.entradaHz); o.put("canales", EqProcesador.entradaCanales);
        o.put("salida", EqProcesador.salida16 ? "PCM 16 bits" : "PCM flotante 32 bits"); o.put("gananciaDb", gananciaAplicadaDb);
        o.put("hiResPuro", getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("hires", false));
        o.put("cortes", Motor.cortes); o.put("saltos", Motor.saltos); o.put("fundidoMs", fundidoMs); o.put("modoRg", modoRg);
        call.resolve(o);
    }
    private static float curva(float x) { x = Math.max(0f, Math.min(1f, x)); return x * x * (3f - 2f * x); }   // suavizado (smoothstep)
    // ── USB directo (bit-perfect, Android 14+) y colchón de audio ──
    private boolean usbDirecto = false;
    private boolean aplicarUsbDirecto(boolean on) {
        if (Build.VERSION.SDK_INT < 34) return false;
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            android.media.AudioAttributes aa = new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build();
            boolean hecho = false;
            for (AudioDeviceInfo d : salidasDisponibles()) {
                int t = d.getType(); if (t != 11 && t != 22) continue;                        // USB (dispositivo o auriculares)
                if (!on) { am.clearPreferredMixerAttributes(aa, d); hecho = true; continue; }
                for (android.media.AudioMixerAttributes m : am.getSupportedMixerAttributes(d)) {
                    if (m.getMixerBehavior() == android.media.AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT) { if (am.setPreferredMixerAttributes(aa, d, m)) hecho = true; break; }
                }
            }
            return hecho;
        } catch (Throwable t) { return false; }
    }
    @PluginMethod public void usbDirecto(PluginCall call) {
        ui(call, () -> {
            usbDirecto = call.getBoolean("on", false);
            JSObject o = new JSObject(); o.put("ok", aplicarUsbDirecto(usbDirecto)); o.put("api", Build.VERSION.SDK_INT); call.resolve(o);
        });
    }
    @PluginMethod public void colchon(PluginCall call) {
        getContext().getSharedPreferences("onda_motor", Context.MODE_PRIVATE).edit().putInt("colchon", Math.max(100, Math.min(3000, call.getInt("ms", 400)))).apply(); call.resolve();
    }
    @PluginMethod public void fundido(PluginCall call) {
        ui(call, () -> {
            fundidoMs = Math.max(0, Math.min(12000, (int) Math.round(call.getData().optDouble("seg", 0) * 1000)));
            if (fundidoMs == 0) { Motor.fFund = 1f; Motor.mezclar(); }
            call.resolve();
        });
    }
    // ruta de salida actual (altavoz / bluetooth / cable / usb), para recordar un ecualizador por salida
    private void anunciarRuta() {
        boolean bt = false, cable = false, usb = false;
        for (AudioDeviceInfo d : salidasDisponibles()) { int x = d.getType(); if (x == 7 || x == 8 || x == 26 || x == 27 || x == 30) bt = true; else if (x == 3 || x == 4) cable = true; else if (x == 11 || x == 22) usb = true; }
        String nom = ""; for (AudioDeviceInfo d : salidasDisponibles()) { int x = d.getType(); if ((bt && (x == 7 || x == 8 || x == 26 || x == 27 || x == 30)) || (!bt && usb && (x == 11 || x == 22)) || (!bt && !usb && cable && (x == 3 || x == 4))) { CharSequence n = d.getProductName(); if (n != null) { nom = n.toString(); break; } } }
        JSObject o = new JSObject(); o.put("tipo", bt ? "bluetooth" : usb ? "usb" : cable ? "cable" : "altavoz"); o.put("nombre", nom); emitir("ruta", o);
    }
    @PluginMethod public void rutaEscuchar(PluginCall call) {
        ui(call, () -> {
            if (cbRuta == null) {
                AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                cbRuta = new android.media.AudioDeviceCallback() {
                    @Override public void onAudioDevicesAdded(AudioDeviceInfo[] a) { if (usbDirecto) aplicarUsbDirecto(true); anunciarRuta(); }
                    @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] a) { anunciarRuta(); }
                };
                am.registerAudioDeviceCallback(cbRuta, h);
            }
            anunciarRuta(); call.resolve();
        });
    }
    private JSObject estadoActual() {
        ExoPlayer p = Motor.jugador; JSObject o = new JSObject();
        o.put("sonando", p != null && p.isPlaying()); o.put("indice", p == null ? -1 : p.getCurrentMediaItemIndex());
        o.put("pos", p == null ? 0 : p.getCurrentPosition()); o.put("dur", p == null || p.getDuration() == C.TIME_UNSET ? -1 : p.getDuration());
        o.put("estado", p == null ? 1 : p.getPlaybackState());
        return o;
    }
    private MediaItem item(JSONObject j) throws Exception { return Motor.itemDe(getContext(), j); }
    private List<MediaItem> items(JSArray a) throws Exception {
        List<MediaItem> l = new ArrayList<>(); for (int i = 0; i < a.length(); i++) l.add(item(a.getJSONObject(i))); return l;
    }
    private boolean rgSube = false; private double rgPre = 0, rgSin = 0;
    private double gananciaDeItem(MediaItem it) {
        double db = 0; double[] g = it == null ? null : rg.get(it.mediaId);
        if (!"off".equals(modoRg)) {
            boolean hay = false;
            if (g != null) {
                double pista = g[0], album = g[1];
                double v = "album".equals(modoRg) ? (Double.isNaN(album) ? pista : album) : (Double.isNaN(pista) ? album : pista);
                if (!Double.isNaN(v)) { hay = true; db = rgSube ? Math.min(v, 12) : Math.min(v, 0); }   // por defecto solo baja el volumen (evita saturar)
            }
            db += hay ? rgPre : rgSin;
        }
        return db;
    }
    private void aplicarGanancia() {
        ExoPlayer p = Motor.jugador; if (p == null) return;
        double db = gananciaDeItem(p.getCurrentMediaItem());
        gananciaAplicadaDb = db + preampDb; Motor.eq.nucleo.ponerGananciaDb(db + preampDb);
    }
    @PluginMethod public void rgAjustes(PluginCall call) {
        ui(call, () -> {
            rgSube = call.getBoolean("sube", false); rgPre = Math.max(-12, Math.min(12, call.getData().optDouble("pre", 0))); rgSin = Math.max(-12, Math.min(12, call.getData().optDouble("sin", 0)));
            aplicarGanancia(); call.resolve();
        });
    }
    private static double leerDb(String t) {
        if (t == null) return Double.NaN;
        try { return Double.parseDouble(t.toLowerCase(Locale.ROOT).replace("db", "").replace(",", ".").trim()); } catch (Exception e) { return Double.NaN; }
    }

    // ───────── escucha del reproductor ─────────
    private class Escucha implements Player.Listener {
        @Override public void onIsPlayingChanged(boolean sonando) {
            emitir("estado", estadoActual()); h.removeCallbacks(tic); h.removeCallbacks(ritmoTic); if (sonando && ritmoOn) h.post(ritmoTic); if (sonando) { h.post(tic); servicio(); efectos(); anunciarSesion(true); } else anunciarSesion(false);
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
                if (e instanceof androidx.media3.extractor.metadata.id3.BinaryFrame && "USLT".equals(((androidx.media3.extractor.metadata.id3.BinaryFrame) e).id)) { String tx = leerUslt(((androidx.media3.extractor.metadata.id3.BinaryFrame) e).data); if (tx != null) { JSObject lo = new JSObject(); lo.put("id", it.mediaId); lo.put("texto", tx); emitir("letra", lo); } }
                if (e instanceof VorbisComment) {
                    VorbisComment v = (VorbisComment) e; String k = v.key == null ? "" : v.key.toUpperCase(Locale.ROOT);
                    if ((k.equals("LYRICS") || k.equals("UNSYNCEDLYRICS") || k.equals("UNSYNCED LYRICS") || k.equals("SYNCEDLYRICS")) && v.value != null && v.value.trim().length() > 20) { JSObject lo = new JSObject(); lo.put("id", it.mediaId); lo.put("texto", v.value); emitir("letra", lo); }
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
            if (motivo == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                if (finCancionSueno) { finCancionSueno = false; Motor.jugador.setPauseAtEndOfMediaItems(brechaMs > 0); emitir("dormido", null); }
                else if (brechaMs > 0) {                                           // silencio entre pistas: espera y sigue sola
                    final int tok = ++brechaTok;
                    h.postDelayed(() -> { ExoPlayer q = Motor.jugador; if (q != null && tok == brechaTok && !q.getPlayWhenReady()) Motor.reproducirSuave(); }, brechaMs);
                } else { Motor.jugador.setPauseAtEndOfMediaItems(false); }
            }
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
                if (fallosAudio > 1) { JSObject o = new JSObject(); o.put("mensaje", "Desactivé los efectos de sonido del sistema para poder reproducir."); emitir("error", o); }
                long pos = q.getCurrentPosition(); int idx = q.getCurrentMediaItemIndex(); q.prepare(); q.seekTo(idx, pos); q.play(); return;
            }
            JSObject o = new JSObject(); o.put("mensaje", "No pude reproducir esta canción (" + e.getErrorCodeName() + ")."); emitir("error", o);
            ExoPlayer p = Motor.jugador; if (p.hasNextMediaItem()) { p.seekToNextMediaItem(); p.prepare(); p.play(); }
        }
    }

    // ───────── datos técnicos de la canción (frecuencia, bits) ─────────
    /** letra sin tiempos guardada en un archivo MP3 (cuadro USLT de ID3) */
    private static String leerUslt(byte[] d) {
        try {
            if (d == null || d.length < 6) return null; int enc = d[0], i = 4; boolean ancho = enc == 1 || enc == 2;
            while (i < d.length) { if (ancho ? (i + 1 < d.length && d[i] == 0 && d[i + 1] == 0) : d[i] == 0) { i += ancho ? 2 : 1; break; } i += ancho ? 2 : 1; }
            if (i >= d.length) return null;
            String cs = enc == 0 ? "ISO-8859-1" : enc == 1 ? "UTF-16" : enc == 2 ? "UTF-16BE" : "UTF-8";
            String t = new String(d, i, d.length - i, cs).trim(); return t.length() > 20 ? t : null;
        } catch (Exception e) { return null; }
    }
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
    // ───────── borrar canciones del teléfono ─────────
    // Android 11+: MediaStore pide la confirmación al propio sistema (no podemos borrar archivos ajenos sin ella).
    // Antes de Android 11 se intenta borrar directamente; si el sistema lo niega, se avisa.
    @PluginMethod public void borrarArchivos(PluginCall call) {
        try {
            org.json.JSONArray ids = call.getArray("ids");
            if (ids == null || ids.length() == 0) { call.reject("Sin canciones"); return; }
            java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.getString(i); if (id.startsWith("ms")) id = id.substring(2);
                uris.add(android.content.ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id)));
            }
            ContentResolver cr = getContext().getContentResolver();
            if (Build.VERSION.SDK_INT >= 30) {
                android.app.PendingIntent pi = MediaStore.createDeleteRequest(cr, uris);
                getActivity().startIntentSenderForResult(pi.getIntentSender(), 4711, null, 0, 0, 0);
                JSObject o = new JSObject(); o.put("pedido", true); call.resolve(o);
            } else {
                int n = 0; for (Uri u : uris) n += cr.delete(u, null, null);
                JSObject o = new JSObject(); o.put("borrados", n); call.resolve(o);
            }
        } catch (SecurityException e) { call.reject("permiso"); }
        catch (Exception e) { call.reject("No pude borrar: " + e.getMessage()); }
    }

    // ───────── comprobar qué canciones siguen en el teléfono (para quitar al instante las borradas) ─────────
    @PluginMethod public void existen(PluginCall call) {
        try {
            org.json.JSONArray ids = call.getArray("ids");
            JSArray vivos = new JSArray();
            if (ids != null && ids.length() > 0) {
                StringBuilder sel = new StringBuilder(MediaStore.Audio.Media._ID + " IN (");
                String[] args = new String[ids.length()];
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i); if (id.startsWith("ms")) id = id.substring(2);
                    args[i] = id; sel.append(i == 0 ? "?" : ",?");
                }
                sel.append(")");
                ContentResolver cr = getContext().getContentResolver();
                try (Cursor c = cr.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, new String[]{MediaStore.Audio.Media._ID}, sel.toString(), args, null)) {
                    while (c != null && c.moveToNext()) vivos.put("ms" + c.getLong(0));
                }
            }
            JSObject o = new JSObject(); o.put("ids", vivos); call.resolve(o);
        } catch (Exception e) { call.reject("No pude revisar: " + e.getMessage()); }
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
    private static final String[] PERMITIDOS = {"itunes.apple.com", "mzstatic.com", "api.deezer.com", "dzcdn.net", "lrclib.net", "musicbrainz.org", "coverartarchive.org", "archive.org", "music.163.com", "translate.googleapis.com", "clients5.google.com", "api.mymemory.translated.net", "api.lyrics.ovh", "raw.githubusercontent.com", "cdn.jsdelivr.net"};
    private static boolean permitido(String direccion) {
        try {
            URL u = new URL(direccion); if (!"https".equals(u.getProtocol())) return false; String host = u.getHost().toLowerCase(Locale.ROOT);
            for (String p : PERMITIDOS) if (host.equals(p) || host.endsWith("." + p)) return true;
        } catch (Exception e) { /* dirección inválida */ }
        return false;
    }
    private static byte[] bajar(String direccion, int max) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(direccion).openConnection();
        c.setRequestProperty("User-Agent", "Onda/0.4 (reproductor personal; github.com/camo043099-eng/reproductor)"); if (direccion.contains("music.163.com")) c.setRequestProperty("Referer", "https://music.163.com/"); if (direccion.contains("google")) c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"); c.setConnectTimeout(8000); c.setReadTimeout(15000);
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
            try { JSObject o = new JSObject(); o.put("codigo", 200); o.put("cuerpo", new String(bajar(u, u.contains("AutoEq") ? 24 << 20 : 4 << 20), "UTF-8")); call.resolve(o); }
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
                p.setMediaItems(items(a), idx, pos); p.prepare(); p.setPlayWhenReady(sonar); Motor.guardarSesion();
                servicio();
                aplicarGanancia(); call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    @PluginMethod public void alternar(PluginCall call) { ui(call, () -> { cruceCancelar(); ExoPlayer p = Motor.jugador; brechaTok++; if (p.getMediaItemCount() == 0) { call.resolve(); return; } if (p.isPlaying()) Motor.pausarSuave(); else { if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0, 0); Motor.reproducirSuave(); } call.resolve(); }); }
    @PluginMethod public void pausa(PluginCall call) { ui(call, () -> { cruceCancelar(); brechaTok++; Motor.pausarSuave(); call.resolve(); }); }
    @PluginMethod public void siguiente(PluginCall call) { ui(call, () -> { cruceCancelar(); ExoPlayer p = Motor.jugador; if (p.hasNextMediaItem()) p.seekToNextMediaItem(); else p.seekTo(0, 0); brechaTok++; Motor.reproducirSuave(); call.resolve(); }); }
    @PluginMethod public void anterior(PluginCall call) { ui(call, () -> { cruceCancelar(); Motor.jugador.seekToPrevious(); call.resolve(); }); }
    @PluginMethod public void irA(PluginCall call) { ui(call, () -> { cruceCancelar(); ExoPlayer p = Motor.jugador; p.seekTo(call.getInt("indice", 0), 0); brechaTok++; Motor.reproducirSuave(); call.resolve(); }); }
    @PluginMethod public void buscar(PluginCall call) { ui(call, () -> { cruceCancelar(); Motor.jugador.seekTo(call.getData().optLong("ms", 0)); call.resolve(); }); }
    @PluginMethod public void repetir(PluginCall call) {
        ui(call, () -> { String m = call.getString("modo", "no"); Motor.jugador.setRepeatMode("uno".equals(m) ? Player.REPEAT_MODE_ONE : "todo".equals(m) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF); call.resolve(); });
    }
    @PluginMethod public void guardarArchivo(PluginCall call) {
        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT < 29) { call.reject("Necesita Android 10 o más"); return; }
                String nombre = call.getString("nombre", "onda-copia.json").replaceAll("[^A-Za-z0-9._-]", "_"), texto = call.getString("texto", "");
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, nombre); v.put(MediaStore.Downloads.MIME_TYPE, "application/json"); v.put(MediaStore.Downloads.RELATIVE_PATH, "Download/Onda");
                Uri u = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u == null) throw new Exception("no se pudo crear el archivo");
                try (java.io.OutputStream o = getContext().getContentResolver().openOutputStream(u)) { o.write(texto.getBytes("UTF-8")); }
                JSObject r = new JSObject(); r.put("ruta", "Descargas/Onda/" + nombre); call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }
    @PluginMethod public void avanzado(PluginCall call) {
        ui(call, () -> {
            ExoPlayer p = Motor.jugador;
            if (call.hasOption("silencio")) p.setSkipSilenceEnabled(call.getBoolean("silencio", false));
            if (call.hasOption("ruido")) p.setHandleAudioBecomingNoisy(call.getBoolean("ruido", true));
            if (call.hasOption("enfoque")) p.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder().setUsage(androidx.media3.common.C.USAGE_MEDIA).setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC).build(), call.getBoolean("enfoque", true));
            call.resolve();
        });
    }
    @PluginMethod public void velocidad(PluginCall call) { ui(call, () -> { Motor.jugador.setPlaybackParameters(new PlaybackParameters(call.getFloat("v", 1f), 1f)); call.resolve(); }); }
    @PluginMethod public void insertar(PluginCall call) {
        ui(call, () -> { try { ExoPlayer p = Motor.jugador; p.addMediaItem(Math.min(call.getInt("indice", 0), p.getMediaItemCount()), item(call.getObject("item"))); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); } });
    }
    @PluginMethod public void quitar(PluginCall call) { ui(call, () -> { cruceCancelar(); Motor.jugador.removeMediaItem(call.getInt("indice", 0)); call.resolve(); }); }
    @PluginMethod public void mover(PluginCall call) { ui(call, () -> { Motor.jugador.moveMediaItem(call.getInt("de", 0), call.getInt("a", 0)); call.resolve(); }); }
    /** Reordena la cola sin cortar la canción que suena (modo aleatorio). */
    @PluginMethod public void reordenar(PluginCall call) {
        ui(call, () -> { cruceCancelar();
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
                boolean on = call.getBoolean("on", true);
                JSArray fs = call.getArray("filtros");
                if (fs != null && fs.length() > 0) {                                   // paramétrico: [[frecuencia, ganancia, Q, tipo], ...]
                    int n = Math.min(NucleoEq.MAXF, fs.length()); double[] f = new double[n], g = new double[n], q = new double[n]; int[] t = new int[n];
                    for (int i = 0; i < n; i++) { JSONArray r = fs.getJSONArray(i); f[i] = r.getDouble(0); g[i] = r.getDouble(1); q[i] = r.getDouble(2); t[i] = r.getInt(3); }
                    Motor.eq.nucleo.ponerFiltros(f, g, q, t, on);
                } else {
                    JSArray b = call.getArray("bandas"); double[] db = new double[10]; for (int i = 0; b != null && i < 10 && i < b.length(); i++) db[i] = b.getDouble(i);
                    Motor.eq.nucleo.ponerBandas(db, on);
                }
                Motor.eq.nucleo.ponerTonoAjuste(call.getData().optDouble("fg", 120), call.getData().optDouble("qg", 0.7), call.getData().optDouble("fa", 6000), call.getData().optDouble("qa", 0.7));
                Motor.eq.nucleo.ponerTono(call.getData().optDouble("grave", 0), call.getData().optDouble("agudo", 0), call.getData().optDouble("bal", 0));
                preampDb = call.getData().optDouble("pre", 0); aplicarGanancia(); call.resolve();
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
        fadeSueno = false; ExoPlayer p = Motor.jugador; if (p != null) { p.setPauseAtEndOfMediaItems(false); finCancionSueno = false; brechaOn(); Motor.fSueno = 1f; Motor.mezclar(); }
    }
    @PluginMethod public void dormir(PluginCall call) {
        ui(call, () -> {
            cancelarSueno(); ExoPlayer p = Motor.jugador;
            if (call.getBoolean("cancion", false)) { finCancionSueno = true; p.setPauseAtEndOfMediaItems(true); call.resolve(); return; }
            double min = call.getData().optDouble("minutos", 0); if (min <= 0) { call.resolve(); return; }
            apagar = new Runnable() {
                int paso = 0;
                @Override public void run() {
                    ExoPlayer q = Motor.jugador; if (q == null) return; paso++; fadeSueno = true;
                    if (paso < 30) { Motor.fSueno = (float) Math.pow(0.001, paso / 30.0); Motor.mezclar(); h.postDelayed(this, 200); }
                    else { q.pause(); Motor.fSueno = 1f; Motor.mezclar(); fadeSueno = false; apagar = null; emitir("dormido", null); }
                }
            };
            h.postDelayed(apagar, (long) (min * 60000) - 6000 > 0 ? (long) (min * 60000) - 6000 : 0);
            call.resolve();
        });
    }
}
