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
import androidx.media3.session.MediaSession;

/** Un solo reproductor para toda la app: lo usan la pantalla y el servicio de la notificación. */
@UnstableApi
public final class Motor {
    public static ExoPlayer jugador;
    public static MediaSession sesion;
    public static EqProcesador eq;

    public static synchronized void iniciar(Context ctx) {
        if (jugador != null) return;
        Context app = ctx.getApplicationContext();
        eq = new EqProcesador();
        EqProcesador.salida16 = app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("salida16", false);
        DefaultRenderersFactory fabrica = new DefaultRenderersFactory(app) {
            @Override
            protected AudioSink buildAudioSink(Context c, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(c)
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .setAudioProcessors(new AudioProcessor[]{eq})
                        .build();
            }
        };
        // Con salida flotante, Media3 NO pasa los FLAC de 24 bits por nuestro procesador (sin ecualizador, sin ondas, sin control de volumen). Sin ella pasan todos.
        // Hi-Res puro (opción del usuario): salida flotante directa, sin ecualizador ni ondas en los FLAC de 24 bits
        fabrica.setEnableAudioFloatOutput(app.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getBoolean("hires", false));
        jugador = new ExoPlayer.Builder(app, fabrica)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_LOCAL)
                .build();
        PendingIntent abrir = PendingIntent.getActivity(app, 0, new Intent(app, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        sesion = new MediaSession.Builder(app, jugador).setId("onda").setSessionActivity(abrir).build();
    }

    public static synchronized void liberar() {
        if (sesion != null) { sesion.release(); sesion = null; }
        if (jugador != null) { jugador.release(); jugador = null; }
    }
}
