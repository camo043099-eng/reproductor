import com.camo.onda.NucleoEq;

public class PruebaEq {
    static void ok(boolean c, String m) { if (!c) { System.err.println("FALLA: " + m); System.exit(1); } System.out.println("ok: " + m); }
    static double rms(float[] x, int desde) { double s = 0; int n = 0; for (int i = desde; i < x.length; i += 2) { s += x[i] * x[i]; n++; } return Math.sqrt(s / n); }
    static float[] seno(double f, double amp, int hz, int n) { float[] x = new float[n * 2]; for (int i = 0; i < n; i++) { float v = (float) (amp * Math.sin(2 * Math.PI * f * i / hz)); x[2 * i] = v; x[2 * i + 1] = v; } return x; }
    public static void main(String[] a) {
        int hz = 44100;
        NucleoEq e = new NucleoEq(); e.configurar(hz, 2);
        float[] x = seno(1000, 0.3, hz, 44100), y = x.clone(); e.procesar(y, y.length);
        ok(java.util.Arrays.equals(x, y), "plano y sin ganancia: idéntico bit a bit");
        double[] b = new double[10]; b[5] = 6; e.ponerBandas(b, true);
        y = x.clone(); e.procesar(y, y.length);
        double r = rms(y, 40000) / rms(x, 40000); ok(Math.abs(20 * Math.log10(r) - 6) < 0.4, "+6 dB a 1 kHz da ~+6 dB (" + 20 * Math.log10(r) + ")");
        e.reiniciar(); float[] z = seno(100, 0.3, hz, 44100), z2 = z.clone(); e.procesar(z2, z2.length);
        ok(Math.abs(20 * Math.log10(rms(z2, 40000) / rms(z, 40000))) < 1.0, "banda de 1 kHz casi no toca 100 Hz");
        e.ponerBandas(new double[10], false); e.ponerGananciaDb(-6); y = x.clone(); e.procesar(y, y.length);
        ok(Math.abs(20 * Math.log10(rms(y, 40000) / rms(x, 40000)) + 6) < 0.05, "ganancia -6 dB");
        e.ponerGananciaDb(12); float[] f = seno(1000, 0.9, hz, 44100); e.procesar(f, f.length);
        float mx = 0; for (float v : f) mx = Math.max(mx, Math.abs(v)); ok(mx <= 1.0f, "el limitador nunca pasa de 1 (" + mx + ")");
        e.ponerBandas(new double[10], false); e.ponerGananciaDb(0); e.reiniciar();
        float[] est = new float[200]; for (int i = 0; i < 100; i++) { est[2 * i] = 0.3f; est[2 * i + 1] = 0.1f; } e.ponerAncho(1); e.procesar(est, est.length);
        ok(Math.abs((est[0] - est[1]) - 0.4) < 1e-5 && Math.abs((est[0] + est[1]) / 2 - 0.2) < 1e-5, "amplitud estéreo: el lado se duplica y el centro no cambia");
        float[] mono = new float[200]; for (int i = 0; i < 200; i++) mono[i] = 0.25f; e.procesar(mono, mono.length);
        boolean igual = true; for (float v : mono) if (Math.abs(v - 0.25f) > 1e-6) igual = false; ok(igual, "una señal mono no cambia con la amplitud estéreo");
        e.ponerAncho(0); e.ponerGananciaDb(0); double[] g = new double[10]; java.util.Arrays.fill(g, 12); e.ponerBandas(g, true); e.reiniciar();
        float[] ru = new float[88200]; java.util.Random rd = new java.util.Random(1); for (int i = 0; i < ru.length; i++) ru[i] = (float) (rd.nextGaussian() * 0.1);
        e.procesar(ru, ru.length); boolean fin = true; for (float v : ru) if (Float.isNaN(v) || Float.isInfinite(v) || Math.abs(v) > 1) fin = false; ok(fin, "estable con todas las bandas a +12 dB");
    }
}
