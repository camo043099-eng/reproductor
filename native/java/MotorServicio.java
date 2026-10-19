package com.camo.onda;

import android.content.Intent;
import androidx.annotation.Nullable;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/** Mantiene la música sonando con la pantalla apagada y muestra la notificación con controles. */
@UnstableApi
public class MotorServicio extends MediaSessionService {
    @Override public void onCreate() {
        super.onCreate(); Motor.iniciar(this);
        try { addSession(Motor.sesion); } catch (Exception e) { /* ya estaba agregada */ }
    }

    @Nullable @Override public MediaSession onGetSession(MediaSession.ControllerInfo info) { Motor.iniciar(this); return Motor.sesion; }

    @Override public void onTaskRemoved(@Nullable Intent raiz) {
        ExoPlayer p = Motor.jugador;
        if (p == null || !p.getPlayWhenReady() || p.getMediaItemCount() == 0) stopSelf();
    }

    @Override public void onDestroy() { super.onDestroy(); }   // el reproductor y la cola se conservan aunque el servicio descanse
}
