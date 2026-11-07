package com.camo.onda;

import android.content.Context;
import androidx.media3.common.MediaItem;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Registro local de errores: un archivo privado (errores.log) que nunca sale del teléfono. Lo escribe tanto el motor como la interfaz web. */
public final class RegistroErrores {
    private static final int MAX = 100_000;                              // bytes; al pasarse se descarta la mitad más vieja
    private RegistroErrores() { }

    private static File archivo(Context ctx) { return new File(ctx.getFilesDir(), "errores.log"); }

    /** sin direcciones, rutas ni correos, en una sola línea y de largo acotado */
    static String limpiar(String t) {
        if (t == null) return "";
        t = t.replaceAll("(?i)\\b(?:content|file|https?)://\\S+", "<uri>")
             .replaceAll("(?<![\\w])/(?:storage|sdcard|data|mnt)/\\S+", "<ruta>")
             .replaceAll("[\\w.+-]+@[\\w-]+\\.[\\w.]+", "<correo>")
             .replaceAll("\\s+", " ").trim();
        return t.length() > 400 ? t.substring(0, 400) + "…" : t;
    }

    /** «Título — Artista» del elemento que suena (solo desde el hilo principal) */
    static String cancionDe(MediaItem m) {
        if (m == null) return "";
        CharSequence t = m.mediaMetadata.title, a = m.mediaMetadata.artist;
        return (t == null ? "" : t) + (a == null || a.length() == 0 ? "" : " — " + a);
    }

    public static synchronized void anotar(Context ctx, String origen, String cancion, String mensaje) {
        try {
            String m = limpiar(mensaje), c = limpiar(cancion); if (m.isEmpty()) return;
            String ver = ctx.getSharedPreferences("onda_motor", Context.MODE_PRIVATE).getString("version", "?");
            String linea = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) + " | v" + ver + " | " + limpiar(origen) + " | " + (c.isEmpty() ? "sin canción" : c) + " | " + m + "\n";
            File f = archivo(ctx);
            if (f.length() > MAX) {
                String t = leer(ctx); int i = t.indexOf('\n', t.length() / 2);
                try (FileOutputStream o = new FileOutputStream(f, false)) { o.write((i < 0 ? "" : t.substring(i + 1)).getBytes(StandardCharsets.UTF_8)); }
            }
            try (FileOutputStream o = new FileOutputStream(f, true)) { o.write(linea.getBytes(StandardCharsets.UTF_8)); }
        } catch (Throwable t) { /* el registro nunca debe provocar otro error */ }
    }

    public static synchronized String leer(Context ctx) {
        File f = archivo(ctx); if (!f.exists()) return "";
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        } catch (Throwable t) { return ""; }
    }

    public static synchronized void borrar(Context ctx) { archivo(ctx).delete(); }
}
