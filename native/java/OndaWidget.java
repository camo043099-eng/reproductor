package com.camo.onda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Build;
import android.util.Size;
import android.view.KeyEvent;
import android.widget.RemoteViews;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import java.io.InputStream;

/** Widget de pantalla de inicio: carátula, título, artista y controles. Los botones mandan teclas multimedia al servicio de Onda (Media3 se encarga de arrancarlo bien). */
@UnstableApi
public class OndaWidget extends AppWidgetProvider {
    private static final String PREFS = "onda_widget";

    @Override public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) { actualizar(ctx); }
    @Override public void onEnabled(Context ctx) { actualizar(ctx); }

    private static boolean hayWidgets(Context ctx) {
        try { return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, OndaWidget.class)).length > 0; } catch (Throwable t) { return false; }
    }

    /** Se llama desde el motor en cada cambio de canción o de reproducción, y cuando el sistema pide refrescar. No hace nada si no hay widgets puestos. */
    public static void actualizar(final Context ctx0) {
        try {
            final Context ctx = ctx0.getApplicationContext();
            if (!hayWidgets(ctx)) return;
            final SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String titulo = sp.getString("titulo", ""), artista = sp.getString("artista", ""), arte = sp.getString("arte", "");
            boolean sonando = false;
            ExoPlayer p = Motor.jugador;
            if (p != null && p.getMediaItemCount() > 0) {                       // el motor vive: se toma lo que suena ahora (se usa solo desde el hilo principal)
                MediaItem it = p.getCurrentMediaItem();
                if (it != null) {
                    titulo = it.mediaMetadata.title == null ? "" : it.mediaMetadata.title.toString();
                    artista = it.mediaMetadata.artist == null ? "" : it.mediaMetadata.artist.toString();
                    arte = it.mediaMetadata.artworkUri == null ? "" : it.mediaMetadata.artworkUri.toString();
                    sp.edit().putString("titulo", titulo).putString("artista", artista).putString("arte", arte).apply();
                }
                sonando = p.getPlayWhenReady();
            }
            final String t = titulo, a = artista, ar = arte; final boolean s = sonando;
            new Thread(new Runnable() { @Override public void run() { pintar(ctx, t, a, cargarArte(ctx, ar), s); } }, "onda-widget").start();   // decodificar la carátula no debe frenar la música
        } catch (Throwable t) { /* el widget es un extra: nunca debe romper la reproducción */ }
    }

    private static void pintar(Context ctx, String titulo, String artista, Bitmap arte, boolean sonando) {
        try {
            AppWidgetManager am = AppWidgetManager.getInstance(ctx);
            int[] ids = am.getAppWidgetIds(new ComponentName(ctx, OndaWidget.class));
            if (ids.length == 0) return;
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_onda);
            v.setTextViewText(R.id.w_titulo, titulo.isEmpty() ? "Onda" : titulo);
            v.setTextViewText(R.id.w_artista, artista.isEmpty() ? "Toca para abrir" : artista);
            if (arte != null) v.setImageViewBitmap(R.id.w_arte, arte); else v.setImageViewResource(R.id.w_arte, R.drawable.ic_w_nota);
            v.setImageViewResource(R.id.w_play, sonando ? R.drawable.ic_w_pause : R.drawable.ic_w_play);
            v.setOnClickPendingIntent(R.id.w_raiz, PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            v.setOnClickPendingIntent(R.id.w_prev, tecla(ctx, KeyEvent.KEYCODE_MEDIA_PREVIOUS, 1));
            v.setOnClickPendingIntent(R.id.w_play, tecla(ctx, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 2));
            v.setOnClickPendingIntent(R.id.w_next, tecla(ctx, KeyEvent.KEYCODE_MEDIA_NEXT, 3));
            am.updateAppWidget(ids, v);
        } catch (Throwable t) { /* ignorar */ }
    }

    /** Botón del widget: una tecla multimedia dirigida al servicio. */
    private static PendingIntent tecla(Context ctx, int codigo, int pedido) {
        Intent i = new Intent(Intent.ACTION_MEDIA_BUTTON).setComponent(new ComponentName(ctx, MotorServicio.class));
        i.putExtra(Intent.EXTRA_KEY_EVENT, new KeyEvent(KeyEvent.ACTION_DOWN, codigo));
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(ctx, pedido, i, fl) : PendingIntent.getService(ctx, pedido, i, fl);
    }

    /** Carátula pequeña (256 px) con esquinas redondeadas; null si no hay o no se puede leer. */
    private static Bitmap cargarArte(Context ctx, String uriTxt) {
        if (uriTxt == null || uriTxt.isEmpty()) return null;
        Bitmap b = null;
        try {
            Uri u = Uri.parse(uriTxt);
            if ("file".equals(u.getScheme())) {
                BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true; BitmapFactory.decodeFile(u.getPath(), o);
                o.inSampleSize = Math.max(1, Math.min(o.outWidth, o.outHeight) / 256); o.inJustDecodeBounds = false;
                b = BitmapFactory.decodeFile(u.getPath(), o);
            } else {
                if (Build.VERSION.SDK_INT >= 29) { try { b = ctx.getContentResolver().loadThumbnail(u, new Size(256, 256), null); } catch (Throwable e) { b = null; } }
                if (b == null) { InputStream in = ctx.getContentResolver().openInputStream(u); if (in != null) { try { b = BitmapFactory.decodeStream(in); } finally { in.close(); } } }
            }
        } catch (Throwable e) { b = null; }
        return b == null ? null : redondear(b, 256);
    }

    private static Bitmap redondear(Bitmap src, int lado) {
        try {
            int m = Math.min(src.getWidth(), src.getHeight());
            Bitmap cuadrado = Bitmap.createBitmap(src, (src.getWidth() - m) / 2, (src.getHeight() - m) / 2, m, m);
            Bitmap escalado = Bitmap.createScaledBitmap(cuadrado, lado, lado, true);
            Bitmap out = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setShader(new BitmapShader(escalado, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
            new Canvas(out).drawRoundRect(new RectF(0, 0, lado, lado), lado * 0.18f, lado * 0.18f, p);
            return out;
        } catch (Throwable e) { return src; }
    }
}
