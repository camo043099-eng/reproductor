package com.camo.onda;

import java.io.*;
import java.nio.*;
import java.nio.file.*;

/**
 * Referencia para el prototipo: procesa un raw float32 estéreo con el NucleoEq REAL de la app
 * (peaking +6 dB a 1 kHz Q=1, crossfeed 0,3, fase opcional) y escribe el resultado.
 * Uso: java -cp <dir_clases> com.camo.onda.ProcesoJava entrada.raw salida.raw [fase:0|1] [basico|completo]
 */
public class ProcesoJava {
    public static void main(String[] a) throws Exception {
        byte[] bytes = Files.readAllBytes(Paths.get(a[0]));
        boolean fase = a.length > 2 && a[2].equals("1");
        boolean completo = a.length > 3 && a[3].equals("completo");
        FloatBuffer in = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
        float[] x = new float[in.remaining()]; in.get(x);

        NucleoEq n = new NucleoEq();
        n.configurar(48000, 2);
        if (completo) {
            n.ponerFiltros(new double[]{1000, 3000}, new double[]{6, -4}, new double[]{1.0, 2.0}, new int[]{NucleoEq.PICO, NucleoEq.PICO}, true);
            n.ponerTono(4, -3, 0.3);
            n.ponerAncho(0.5);
        } else {
            n.ponerFiltros(new double[]{1000}, new double[]{6}, new double[]{1.0}, new int[]{NucleoEq.PICO}, true);
        }
        n.ponerCrossfeed(0.3);
        n.ponerFaseInvertida(fase);

        final int trozo = 1024 * 2;                       // mismo tamaño de bloque que usaría el callback
        for (int p = 0; p < x.length; p += trozo) {
            float[] b = java.util.Arrays.copyOfRange(x, p, Math.min(x.length, p + trozo));
            n.procesar(b, b.length);
            System.arraycopy(b, 0, x, p, b.length);
        }
        ByteBuffer out = ByteBuffer.allocate(x.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : x) out.putFloat(v);
        Files.write(Paths.get(a[1]), out.array());
    }
}
