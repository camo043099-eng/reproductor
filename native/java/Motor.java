package com.camo.onda;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioTrackBufferSizeProvider;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.session.MediaSession;

/** Un solo reproductor para toda la app: lo usan la pantalla y el servicio de la notificación. */
@UnstableApi
public final class Motor {
    public static ExoPlayer jugador;
    public static MediaSession sesion;
    public static volatile int cortes = 0, saltos = 0;                // cortes de audio (el sonido se quedó sin datos) y saltos de posición desde que abrió la app
    public static EqProcesador eq;

    // ── mezclador de volumen: fundido de canción × pausa/play suave × temporizador de sueño ──
    public static volatile float fFund = 1f, fTransp = 1f, fSueno = 1f;
    public static volatile int fadeMs = 0;                              // fundido al pausar / reproducir (0 = apagado)
    private static final android.os.Handler hm = new android.os.Handler(android.os.Looper.getMainLooper());
    private static Runnable rampa = null;
    public static void mezclar() { ExoPlayer p = jugador; if (p != null) p.setVolume(Math.max(0f, Math.min(1f, fFund * fTransp * fSueno))); }
    public static boolean rampaActiva() { return rampa != null; }
    private static void parar() { if (rampa != null) { hm.removeCallbacks(rampa); rampa = null; } }
    private static void rampar(final float a, final float b, final int ms, final Runnable fin) {
        parar(); final long t0 = android.os.SystemClock.uptimeMillis();
        rampa = new Runnable() {
            @Override public void run() {
                float x = Math.min(1f, (android.os.SystemClock.uptimeMillis() - t0) / (float) ms);
                fTransp = a + (b - a) * x * x * (3f - 2f * x); mezclar();
                if (x < 1f) hm.postDelayed(this, 16); else { rampa = null; if (fin != null) fin.run(); }
            }
        };
        rampa.run();
    }
    public static void reproducirSuave() {
        ExoPlayer p = jugador; if (p == null) return; parar();
        // tras un stop (p. ej. "detener al cerrar desde recientes") el reproductor queda en IDLE: hay que volver a preparar o play no hace nada
        if (p.getPlaybackState() == androidx.media3.common.Player.STATE_IDLE && p.getMediaItemCount() > 0) p.prepare();
        if (fadeMs <= 0 || p.isPlaying()) { fTransp = 1f; mezclar(); p.play(); return; }
        fTransp = 0f; mezclar(); p.play(); rampar(0f, 1f, fadeMs, null);
    }
    public static void pausarSuave() {
        final ExoPlayer p = jugador; if (p == null) return; parar();
        if (fadeMs <= 0 || !p.isPlaying()) { p.pause(); fTransp = 1f; mezclar(); return; }
        rampar(fTransp, 0f, fadeMs, new Runnable() { @Override public void run() { p.pause(); fTransp = 1f; mezclar(); } });
    }

    public static Context appCtx;
    public static ExoPlayer jugadorB;                                   // segundo reproductor, solo vive durante una mezcla entre canciones
    public static EqProcesador eqB;

    /** Construye un reproductor completo con su propio procesador de ecualizador. */
    private static ExoPlayer construir(Context app, final EqProcesador ep, boolean foco) {
        final int colchonUs = Math.max(100, Math.min(3000, app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getInt("colchon", 400))) * 1000;   // colchón de audio elegido por el usuario (ms)
        DefaultRenderersFactory fabrica = new DefaultRenderersFactory(app) {
            @Override
            protected AudioSink buildAudioSink(Context c, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(c)
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .setAudioProcessors(new AudioProcessor[]{ep})
                        // más colchón de audio: si el teléfono se atrasa un instante (otra app, ahorro de batería) no se oyen saltos
                        .setAudioTrackBufferSizeProvider(new DefaultAudioTrackBufferSizeProvider.Builder().setMinPcmBufferDurationUs(colchonUs).setMaxPcmBufferDurationUs(Math.max(1_000_000, colchonUs * 2)).build())
                        .build();
            }
        };
        // Con salida flotante, Media3 NO pasa los FLAC de 24 bits por nuestro procesador (sin ecualizador, sin ondas, sin control de volumen). Sin ella pasan todos.
        // Hi-Res puro (opción del usuario): salida flotante directa, sin ecualizador ni ondas en los FLAC de 24 bits
        fabrica.setEnableAudioFloatOutput(app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("hires", false));
        ExoPlayer p = new ExoPlayer.Builder(app, fabrica)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), foco)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_LOCAL)
                .build();
        p.addAnalyticsListener(new androidx.media3.exoplayer.analytics.AnalyticsListener() {
            @Override public void onAudioUnderrun(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime t, int tam, long ms, long desde) { cortes++; }
        });
        p.addListener(new androidx.media3.common.Player.Listener() {
            @Override public void onPositionDiscontinuity(androidx.media3.common.Player.PositionInfo antes, androidx.media3.common.Player.PositionInfo ahora, int motivo) { if (motivo == androidx.media3.common.Player.DISCONTINUITY_REASON_INTERNAL || motivo == androidx.media3.common.Player.DISCONTINUITY_REASON_SKIP) saltos++; if (p == jugador) guardarSesion(); }
            @Override public void onIsPlayingChanged(boolean sonando) { if (p == jugador) { guardarSesion(); OndaWidget.actualizar(app); } }
            @Override public void onPlayWhenReadyChanged(boolean listo, int motivo) { if (p == jugador) OndaWidget.actualizar(app); }
            @Override public void onMediaItemTransition(MediaItem item, int motivo) { if (p == jugador) { guardarSesion(); OndaWidget.actualizar(app); } }
        });
        return p;
    }
    private static ForwardingPlayer envolver(ExoPlayer p) {
        return new ForwardingPlayer(p) {
            @Override public void play() { Motor.reproducirSuave(); }
            @Override public void pause() { Motor.pausarSuave(); }
            @Override public void setPlayWhenReady(boolean listo) { if (listo) Motor.reproducirSuave(); else Motor.pausarSuave(); }
        };
    }

    // ── sesión: la cola, el índice y la posición se guardan en el teléfono para reanudar tras cerrar la app ──
    private static final java.util.Map<String, JSONObject> datos = new java.util.concurrent.ConcurrentHashMap<>();   // lo necesario para rearmar cada elemento
    private static final Handler latido = new Handler(Looper.getMainLooper());
    private static final Runnable latidoSesion = new Runnable() { @Override public void run() { if (jugador != null && jugador.isPlaying()) guardarSesion(); latido.postDelayed(this, 5000); } };
    private static String colaGuardada = null;

    /** Construye un elemento de la cola y recuerda sus datos para poder restaurarlo. */
    public static MediaItem itemDe(Context ctx, JSONObject j) throws Exception {
        String albumId = j.optString("albumId", "");
        File f = new File(ctx.getFilesDir(), "portadas/" + albumId + ".jpg");
        android.net.Uri arte = f.exists() ? android.net.Uri.fromFile(f) : (albumId.isEmpty() ? null : android.net.Uri.parse("content://media/external/audio/albumart/" + albumId));
        MediaMetadata.Builder mb = new MediaMetadata.Builder().setTitle(j.optString("titulo", "")).setArtist(j.optString("artista", "")).setAlbumTitle(j.optString("album", ""));
        if (arte != null) mb.setArtworkUri(arte);
        String id = j.getString("id");
        datos.put(id, j);
        return new MediaItem.Builder().setMediaId(id).setUri(android.net.Uri.parse(j.getString("uri"))).setMediaMetadata(mb.build()).build();
    }

    /** Guarda la cola viva del reproductor, el índice y la posición. Sin cola no toca lo guardado. */
    public static void guardarSesion() {
        ExoPlayer p = jugador; Context c = appCtx;
        if (p == null || c == null || p.getMediaItemCount() == 0) return;
        try {
            JSONArray arr = new JSONArray();
            for (int i = 0; i < p.getMediaItemCount(); i++) { JSONObject j = datos.get(p.getMediaItemAt(i).mediaId); if (j == null) return; arr.put(j); }
            String cola = arr.toString();
            SharedPreferences.Editor e = c.getSharedPreferences("onda_sesion", Context.MODE_PRIVATE).edit();
            if (!cola.equals(colaGuardada)) { e.putString("cola", cola); colaGuardada = cola; }
            e.putInt("idx", Math.max(0, p.getCurrentMediaItemIndex())).putLong("pos", Math.max(0, p.getCurrentPosition())).apply();
        } catch (Exception ignore) { /* no es crítico: se guarda en el siguiente cambio */ }
    }

    private static void restaurarSesion(Context app) {
        try {
            SharedPreferences sp = app.getSharedPreferences("onda_sesion", Context.MODE_PRIVATE);
            String cola = sp.getString("cola", null); if (cola == null) return;
            JSONArray arr = new JSONArray(cola); List<MediaItem> l = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) l.add(itemDe(app, arr.getJSONObject(i)));
            if (l.isEmpty()) return;
            int idx = Math.max(0, Math.min(sp.getInt("idx", 0), l.size() - 1));
            jugador.setMediaItems(l, idx, Math.max(0, sp.getLong("pos", 0)));
            jugador.prepare(); jugador.setPlayWhenReady(false);
            colaGuardada = cola;
        } catch (Exception ignore) { /* sin sesión válida: se empieza vacío */ }
    }

    public static synchronized void iniciar(Context ctx) {
        if (jugador != null) return;
        Context app = ctx.getApplicationContext(); appCtx = app;
        eq = new EqProcesador();
        // el modo de 16 bits es solo un recurso de emergencia dentro de la sesión: ya no se guarda, para que un fallo puntual no deje el audio de 24 bits recortado para siempre
        EqProcesador.salida16 = false;
        app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).edit().remove("salida16").apply();
        jugador = construir(app, eq, true);
        restaurarSesion(app);                                            // la cola y la posición de la última vez, en pausa, listas para Play
        latido.removeCallbacks(latidoSesion); latido.postDelayed(latidoSesion, 5000);
        PendingIntent abrir = PendingIntent.getActivity(app, 0, new Intent(app, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        sesion = new MediaSession.Builder(app, envolver(jugador)).setId("onda").setSessionActivity(abrir).build();
    }

    // ── mezcla entre canciones (experimental): un segundo reproductor entra mientras el primero se apaga, y luego toma su lugar ──
    public static ExoPlayer crearCruce() {
        abortarCruce();
        eqB = new EqProcesador(); eqB.nucleo.copiarDe(eq.nucleo);
        jugadorB = construir(appCtx, eqB, false);                         // sin foco de audio: el foco lo sigue teniendo el primero
        return jugadorB;
    }
    public static void abortarCruce() {
        ExoPlayer b = jugadorB; jugadorB = null; eqB = null;
        if (b != null) { try { b.release(); } catch (Throwable t) { /* ya liberado */ } }
        fFund = 1f; mezclar();
    }
    /** el segundo reproductor pasa a ser el principal (la notificación y la app lo siguen automáticamente) */
    public static void intercambiar() {
        ExoPlayer a = jugador, b = jugadorB; if (b == null) return;
        jugador = b; eq = eqB; jugadorB = null; eqB = null; fFund = 1f; fTransp = 1f;
        if (sesion != null) sesion.setPlayer(envolver(b));
        if (a != null) { try { a.release(); } catch (Throwable t) { /* ya liberado */ } }
        b.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        mezclar();
    }

    public static synchronized void liberar() {
        if (sesion != null) { sesion.release(); sesion = null; }
        if (jugador != null) { jugador.release(); jugador = null; }
    }
}
