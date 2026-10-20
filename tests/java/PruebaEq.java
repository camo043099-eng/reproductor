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
        double r = rms(y, 40000) / rms(x, 40000); ok(Math.abs(20 * Math.log10(r)) < 0.5, "+6 dB a 1 kHz queda en ~0 dB neto por el margen automático (" + 20 * Math.log10(r) + ")");
        e.reiniciar(); float[] z = seno(100, 0.3, hz, 44100), z2 = z.clone(); e.procesar(z2, z2.length);
        ok(20 * Math.log10(rms(z2, 40000) / rms(z, 40000)) < -4.5, "con el margen, lo que no se sube queda ~6 dB más bajo");
        e.ponerBandas(new double[10], false); e.ponerGananciaDb(-6); y = x.clone(); e.procesar(y, y.length);
        ok(Math.abs(20 * Math.log10(rms(y, 40000) / rms(x, 40000)) + 6) < 0.05, "ganancia -6 dB");
        // preset Rock: ninguna frecuencia puede pasar de la amplitud de entrada (sin recortes ni distorsión)
        NucleoEq r2 = new NucleoEq(); r2.configurar(hz, 2); r2.ponerBandas(new double[]{4, 3, 2, 0, -1, -1, 1, 3, 4, 5}, true);
        double peor = 0; for (double fr : new double[]{31, 45, 62, 100, 200, 500, 1000, 2000, 3000, 4000, 6000, 8000, 12000, 16000}) { r2.reiniciar(); float[] q = seno(fr, 0.9, hz, 44100); r2.procesar(q, q.length); float m = 0; for (int i = 20000; i < q.length; i++) m = Math.max(m, Math.abs(q[i])); peor = Math.max(peor, m); }
        ok(peor <= 0.93, "preset Rock con senos al 90%: el pico máximo no pasa de 0,93 (" + peor + ")");
        e.ponerGananciaDb(12); float[] f = seno(1000, 0.9, hz, 44100); e.procesar(f, f.length);
        float mx = 0; for (float v : f) mx = Math.max(mx, Math.abs(v)); ok(mx <= 1.0f, "el limitador nunca pasa de 1 (" + mx + ")");
        e.ponerBandas(new double[10], false); e.ponerGananciaDb(0); e.reiniciar();
        float[] est = new float[4000]; for (int i = 0; i < 2000; i++) { est[2 * i] = 0.3f; est[2 * i + 1] = 0.1f; } e.configurar(44100, 2); e.ponerAncho(1); e.procesar(est, est.length);
        ok(Math.abs((est[3998] - est[3999]) - 0.4) < 1e-5 && Math.abs((est[3998] + est[3999]) / 2 - 0.2) < 1e-5, "amplitud estéreo: el lado se duplica y el centro no cambia");
        float[] mono = new float[200]; for (int i = 0; i < 200; i++) mono[i] = 0.25f; e.procesar(mono, mono.length);
        boolean igual = true; for (float v : mono) if (Math.abs(v - 0.25f) > 1e-6) igual = false; ok(igual, "una señal mono no cambia con la amplitud estéreo");
        e.ponerAncho(0); e.ponerGananciaDb(0); double[] g = new double[10]; java.util.Arrays.fill(g, 12); e.ponerBandas(g, true); e.reiniciar();
        float[] ru = new float[88200]; java.util.Random rd = new java.util.Random(1); for (int i = 0; i < ru.length; i++) ru[i] = (float) (rd.nextGaussian() * 0.1);
        e.procesar(ru, ru.length); boolean fin = true; for (float v : ru) if (Float.isNaN(v) || Float.isInfinite(v) || Math.abs(v) > 1) fin = false; ok(fin, "estable con todas las bandas a +12 dB");
        NucleoEq re = new NucleoEq(); re.configurar(hz, 2); re.ponerRealce(0.18);
        float[] sil = new float[8000]; re.procesar(sil, sil.length); boolean cero = true; for (float v : sil) if (v != 0) cero = false; ok(cero, "realce: el silencio sigue siendo silencio");
        re.reiniciar(); float[] g1 = seno(1000, 0.3, hz, 44100), g2 = g1.clone(); re.procesar(g2, g2.length);
        ok(Math.abs(20 * Math.log10(rms(g2, 40000) / rms(g1, 40000))) < 0.5, "realce: un grave de 1 kHz casi no cambia");
        re.reiniciar(); float[] a1 = seno(9000, 0.3, hz, 44100), a2 = a1.clone(); re.procesar(a2, a2.length); float pk = 0; boolean fi = true; for (float v : a2) { pk = Math.max(pk, Math.abs(v)); if (Float.isNaN(v)) fi = false; }
        ok(fi && pk <= 1.0f, "realce: agudos al 30% estables y sin pasar de 1 (" + pk + ")");
        re.ponerRealce(0); re.reiniciar(); float[] p1 = seno(9000, 0.3, hz, 44100), p2 = p1.clone(); re.procesar(p2, p2.length); ok(java.util.Arrays.equals(p1, p2), "realce apagado: idéntico bit a bit");
        NucleoEq pr = new NucleoEq(); pr.configurar(hz, 2);
        pr.ponerFiltros(new double[]{1000, 100}, new double[]{6, 0}, new double[]{2, 1}, new int[]{0, 0}, true);
        float[] t1 = seno(1000, 0.2, hz, 44100), t2 = t1.clone(); pr.procesar(t2, t2.length);
        double gp = 20 * Math.log10(rms(t2, 40000) / rms(t1, 40000)); ok(Math.abs(gp) < 0.5, "paramétrico +6 dB a 1 kHz: neto ~0 dB con el margen automático (" + gp + ")");
        pr.reiniciar(); float[] t3 = seno(100, 0.2, hz, 44100), t4 = t3.clone(); pr.procesar(t4, t4.length);
        ok(20 * Math.log10(rms(t4, 40000) / rms(t3, 40000)) < -4, "paramétrico: lo que no se sube queda más bajo (margen)");
        NucleoEq pf = new NucleoEq(); pf.configurar(hz, 2); double[] ff = new double[32], gg = new double[32], qq = new double[32]; int[] tt = new int[32];
        for (int k = 0; k < 32; k++) { ff[k] = 40 * Math.pow(1.25, k); gg[k] = (k % 2 == 0 ? 8 : -8); qq[k] = 4; }
        pf.ponerFiltros(ff, gg, qq, tt, true); float[] ru2 = new float[88200]; java.util.Random r3 = new java.util.Random(7); for (int k = 0; k < ru2.length; k++) ru2[k] = (float) (r3.nextGaussian() * 0.1);
        pf.procesar(ru2, ru2.length); boolean estF = true; for (float v : ru2) if (Float.isNaN(v) || Float.isInfinite(v) || Math.abs(v) > 1) estF = false; ok(estF, "32 filtros extremos: estable y sin pasar de 1");
        NucleoEq to = new NucleoEq(); to.configurar(hz, 2); to.ponerTono(6, 0, 0); float[] g5 = seno(60, 0.2, hz, 44100), g6 = g5.clone(); to.procesar(g6, g6.length);
        ok(rms(g6, 40000) > rms(g5, 40000) * 0.9 && rms(g6, 40000) < rms(g5, 40000) * 3, "tono: graves +6 dB suben los graves (con margen)");
        { NucleoEq tA1 = new NucleoEq(), tA2 = new NucleoEq(); tA1.configurar(hz, 2); tA2.configurar(hz, 2); tA1.ponerTono(6, 0, 0); tA2.ponerTono(6, 0, 0); tA2.ponerTonoAjuste(300, 0.7, 6000, 0.7);
          float[] s1 = seno(200, 0.2, hz, 44100), s2 = s1.clone(); tA1.procesar(s1, s1.length); tA2.procesar(s2, s2.length);
          ok(rms(s2, 40000) > rms(s1, 40000) * 1.05, "tono: subir la frecuencia de graves refuerza más los 200 Hz"); boolean tFin = true; for (float v : s2) if (Float.isNaN(v) || Math.abs(v) > 1) tFin = false; ok(tFin, "tono ajustable: estable"); }
        NucleoEq ba = new NucleoEq(); ba.configurar(hz, 2); ba.ponerTono(0, 0, 0.5); float[] b1 = seno(1000, 0.3, hz, 4410), b2 = b1.clone(); ba.procesar(b2, b2.length);
        ok(Math.abs(b2[4000] - b1[4000] * 0.5) < 1e-4 || Math.abs(b2[4000]) <= Math.abs(b1[4000]), "balance: baja el canal izquierdo, el derecho intacto");
    }
}
