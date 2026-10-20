package com.camo.onda;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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
            @Override public void onPositionDiscontinuity(androidx.media3.common.Player.PositionInfo antes, androidx.media3.common.Player.PositionInfo ahora, int motivo) { if (motivo == androidx.media3.common.Player.DISCONTINUITY_REASON_INTERNAL || motivo == androidx.media3.common.Player.DISCONTINUITY_REASON_SKIP) saltos++; }
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

    public static synchronized void iniciar(Context ctx) {
        if (jugador != null) return;
        Context app = ctx.getApplicationContext(); appCtx = app;
        eq = new EqProcesador();
        EqProcesador.salida16 = app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("salida16", false);
        jugador = construir(app, eq, true);
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
