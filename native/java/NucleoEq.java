package com.camo.onda;

/** Ecualizador (gráfico de 10 bandas o paramétrico de hasta 32 filtros) con tono, balance, preamplificación y limitador suave. Trabaja en coma flotante (double) y no depende de Android. */
public final class NucleoEq {
    public static final int N = 10;
    public static final double[] F = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    private static final double Q = 1.1;
    public static final int MAXF = 32, SLOTS = MAXF + 2;                  // 32 filtros del usuario + graves + agudos (tono)
    public static final int PICO = 0, EST_GRAVE = 1, EST_AGUDO = 2;
    private final double[] ff = new double[SLOTS], fg = new double[SLOTS], fq = new double[SLOTS]; private final int[] ft = new int[SLOTS];
    private int nf = N;
    private double tonoGrave = 0, tonoAgudo = 0, balance = 0;               // dB y -1..1

    private boolean eqOn = true;
    private double gananciaDb = 0;
    private volatile boolean sucio = true;
    private int canales = 2, hz = 44100;
    private double[][] coef = new double[SLOTS][5];                 // b0 b1 b2 a1 a2 (ya divididos por a0)
    private double[][][] estado = new double[2][SLOTS][4];          // [canal][banda]{x1,x2,y1,y2}
    private double lineal = 1, gAct = 1;                      // ganancia deseada y ganancia que suena ahora (cambia suave, sin chasquidos)
    private boolean saltarGan = false;
    private int rampa = 0, rampaTot = 1;                                       // muestras (por canal) que faltan de entrada suave tras empezar/saltar
    private double ancho = 0;                                   // 0 = normal, 1 = el doble de separación estéreo
    private boolean pasaTodo = true;
    private double realce = 0;                                   // 0 = apagado; 0,10 suave; 0,18 medio (mezcla del brillo regenerado)
    private final double[][] hp = new double[2][4];              // [canal]{x1, y1 (1.er filtro), x1, y1 (2.º filtro)}
    private volatile boolean faseInvertida = false;             // true: invierte la fase de toda la señal (rips de vinilo antiguos, pruebas de fase)
    private volatile double crossfeed = 0;                      // 0 = apagado; mezcla del canal opuesto filtrado (graves/medios) para IEMs cerrados
    private static final double CF_CORTE_HZ = 700;               // corte del paso bajo del crossfeed (estilo Chu Moy)
    private double cfK = 0;                                     // coeficiente del paso bajo, depende de la frecuencia de muestreo
    private final double[] cfBajo = new double[2];              // estado del paso bajo: [0] sigue al R (va al L), [1] sigue al L (va al R)
    public synchronized void ponerRealce(double m) { realce = Math.max(0, Math.min(0.3, m)); }
    public void ponerFaseInvertida(boolean v) { faseInvertida = v; }
    /** mezcla de 0 a 0,6 del canal opuesto (filtrado a graves y medios) */
    public void ponerCrossfeed(double m) { crossfeed = Math.max(0, Math.min(0.6, m)); }

    public synchronized void configurar(int hz, int canales) {
        this.hz = hz; this.canales = Math.max(1, canales);
        this.estado = new double[this.canales][SLOTS][4];
        cfK = 1 - Math.exp(-2 * Math.PI * CF_CORTE_HZ / Math.max(8000, hz));
        java.util.Arrays.fill(cfBajo, 0);
        sucio = true; rampa = rampaTot = Math.max(1, hz / 80); saltarGan = true;
    }
    public synchronized void reiniciar() { for (double[][] c : estado) for (double[] b : c) java.util.Arrays.fill(b, 0); java.util.Arrays.fill(cfBajo, 0); sucio = true; rampa = rampaTot = Math.max(1, hz / 80); saltarGan = true; }
    public NucleoEq() { for (int i = 0; i < N; i++) { ff[i] = F[i]; fq[i] = Q; ft[i] = i == 0 ? EST_GRAVE : i == N - 1 ? EST_AGUDO : PICO; } }
    /** gráfico clásico de 10 bandas (31 Hz a 16 kHz) */
    public synchronized void ponerBandas(double[] db, boolean activo) {
        nf = N; for (int i = 0; i < N; i++) { ff[i] = F[i]; fq[i] = Q; ft[i] = i == 0 ? EST_GRAVE : i == N - 1 ? EST_AGUDO : PICO; fg[i] = i < db.length ? Math.max(-12, Math.min(12, db[i])) : 0; }
        eqOn = activo; sucio = true;
    }
    /** paramétrico: hasta 32 filtros {frecuencia Hz, ganancia dB, Q, tipo 0 pico / 1 estante grave / 2 estante agudo} */
    public synchronized void ponerFiltros(double[] f, double[] g, double[] q, int[] t, boolean activo) {
        nf = Math.max(0, Math.min(MAXF, Math.min(Math.min(f.length, g.length), Math.min(q.length, t.length))));
        for (int i = 0; i < nf; i++) { ff[i] = Math.max(15, Math.min(20000, f[i])); fg[i] = Math.max(-18, Math.min(18, g[i])); fq[i] = Math.max(0.1, Math.min(18, q[i])); ft[i] = t[i] == EST_GRAVE || t[i] == EST_AGUDO ? t[i] : PICO; }
        for (int i = nf; i < MAXF; i++) fg[i] = 0;
        eqOn = activo; sucio = true;
    }
    private double tfG = 120, tqG = 0.7, tfA = 6000, tqA = 0.7;
    /** frecuencia y ancho (Q) de los controles de tono */
    public synchronized void ponerTonoAjuste(double fg, double qg, double fa, double qa) { tfG = Math.max(30, Math.min(400, fg)); tqG = Math.max(0.3, Math.min(2, qg)); tfA = Math.max(2000, Math.min(16000, fa)); tqA = Math.max(0.3, Math.min(2, qa)); sucio = true; }
    public synchronized void ponerTono(double grave, double agudo, double bal) { tonoGrave = Math.max(-12, Math.min(12, grave)); tonoAgudo = Math.max(-12, Math.min(12, agudo)); balance = Math.max(-1, Math.min(1, bal)); sucio = true; }
    public synchronized void ponerAncho(double a) { ancho = Math.max(0, Math.min(1, a)); sucio = true; }
    public synchronized void ponerGananciaDb(double db) { gananciaDb = Math.max(-24, Math.min(12, db)); sucio = true; }

    /** copia todos los ajustes de otro núcleo (para la mezcla entre canciones: el segundo reproductor suena igual) */
    public synchronized void copiarDe(NucleoEq o) {
        synchronized (o) {
            System.arraycopy(o.ff, 0, ff, 0, SLOTS); System.arraycopy(o.fg, 0, fg, 0, SLOTS); System.arraycopy(o.fq, 0, fq, 0, SLOTS); System.arraycopy(o.ft, 0, ft, 0, SLOTS);
            nf = o.nf; tonoGrave = o.tonoGrave; tonoAgudo = o.tonoAgudo; balance = o.balance; eqOn = o.eqOn; gananciaDb = o.gananciaDb;
            tfG = o.tfG; tqG = o.tqG; tfA = o.tfA; tqA = o.tqA; ancho = o.ancho; realce = o.realce; sucio = true;
            faseInvertida = o.faseInvertida; crossfeed = o.crossfeed;
        }
    }

    private synchronized void recalcular() {
        boolean algunaBanda = false;
        for (int i = 0; i < SLOTS; i++) {
            double f, g, q; int t;
            if (i < MAXF) { if (i >= nf) { coef[i][0] = 1; coef[i][1] = coef[i][2] = coef[i][3] = coef[i][4] = 0; continue; } f = ff[i]; g = fg[i]; q = fq[i]; t = ft[i]; }
            else if (i == MAXF) { f = tfG; g = tonoGrave; q = tqG; t = EST_GRAVE; } else { f = tfA; g = tonoAgudo; q = tqA; t = EST_AGUDO; }
            if (!eqOn || Math.abs(g) < 0.01 || f >= hz / 2.0) { coef[i][0] = 1; coef[i][1] = coef[i][2] = coef[i][3] = coef[i][4] = 0; continue; }
            algunaBanda = true; calcular(i, f, g, q, t);
        }
        // margen automático: se baja la ganancia lo que el ecualizador sube como máximo, para que los picos no se recorten ni suenen sucios
        double maxDb = 0;
        if (algunaBanda) for (int k = 0; k < 240; k++) {
            double f = 20 * Math.pow(1000, k / 239.0); if (f >= hz / 2.0) break;
            double w = 2 * Math.PI * f / hz, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w), mag2 = 1;
            for (int i = 0; i < SLOTS; i++) {
                double[] co = coef[i]; double nr = co[0] + co[1] * c1 + co[2] * c2, ni = -(co[1] * s1 + co[2] * s2), dr = 1 + co[3] * c1 + co[4] * c2, di = -(co[3] * s1 + co[4] * s2);
                mag2 *= (nr * nr + ni * ni) / (dr * dr + di * di);
            }
            maxDb = Math.max(maxDb, 10 * Math.log10(mag2));
        }
        lineal = Math.pow(10, (gananciaDb - Math.min(9, maxDb)) / 20);
        pasaTodo = !algunaBanda && Math.abs(gananciaDb) < 0.001 && ancho < 0.001 && Math.abs(balance) < 0.005;
        sucio = false;
    }
    /** fórmulas del "Audio EQ Cookbook" (Robert Bristow-Johnson): estante grave, picos y estante agudo */
    private void calcular(int i, double fr, double gd, double qq, int tipo) {
        double A = Math.pow(10, gd / 40), w = 2 * Math.PI * fr / hz, cs = Math.cos(w), sn = Math.sin(w);
        double b0, b1, b2, a0, a1, a2;
        if (tipo != PICO) {
            double S = 1, al = sn / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2), r = 2 * Math.sqrt(A) * al;
            if (tipo == EST_GRAVE) {
                b0 = A * ((A + 1) - (A - 1) * cs + r); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - r);
                a0 = (A + 1) + (A - 1) * cs + r; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - r;
            } else {
                b0 = A * ((A + 1) + (A - 1) * cs + r); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - r);
                a0 = (A + 1) - (A - 1) * cs + r; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - r;
            }
        } else {
            double al = sn / (2 * qq);
            b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
        }
        coef[i][0] = b0 / a0; coef[i][1] = b1 / a0; coef[i][2] = b2 / a0; coef[i][3] = a1 / a0; coef[i][4] = a2 / a0;
    }

    /** Procesa muestras entrelazadas (valores entre -1 y 1) en el mismo arreglo. */
    public void procesar(float[] x, int cuantas) {
        if (sucio) recalcular();
        if (saltarGan) { gAct = lineal; saltarGan = false; }
        final double kG = 1 - Math.exp(-1.0 / (0.02 * Math.max(8000, hz)));
        final int C = canales;
        final boolean cruce = crossfeed > 0.001 && C == 2, fase = faseInvertida;
        if (pasaTodo && gAct == lineal && realce == 0 && !cruce && !fase) { rampa = 0; return; }   // plano y sin ganancia: pasa idéntico, bit a bit
        final double g = lineal;
        for (int k = 0; k < cuantas; k++) {
            int c = k % C; if (c == 0) { gAct += (g - gAct) * kG; if (Math.abs(g - gAct) < 1e-7) gAct = g; }
            double v = x[k] * gAct;
            double[][] est = estado[c];
            for (int b = 0; b < SLOTS; b++) {
                double[] co = coef[b];
                if (co[1] == 0 && co[0] == 1 && co[2] == 0 && co[3] == 0 && co[4] == 0) continue;
                double[] s = est[b];
                double y = co[0] * v + co[1] * s[0] + co[2] * s[1] - co[3] * s[2] - co[4] * s[3];
                s[1] = s[0]; s[0] = v; s[3] = s[2]; s[2] = y; v = y;
            }
            if (realce > 0 && c < 2) {                                    // regenera brillo que el MP3 de poca calidad recortó (armónicos suaves de lo que sí quedó)
                final double a = 1.0 / (1.0 + 2 * Math.PI * 5000.0 / Math.max(8000, hz)); double[] h = hp[c];
                double e = a * (h[1] + v - h[0]); h[0] = v; h[1] = e;
                double g2 = Math.tanh(3 * e), d = a * (h[3] + g2 - h[2]); h[2] = g2; h[3] = d;
                v += realce * d;
            }
            if (rampa > 0) { v *= 1.0 - (double) rampa / rampaTot; if (c == C - 1) rampa--; }   // entrada suave de ~12 ms: sin chasquido al empezar o saltar
            x[k] = (float) v;
        }
        if (ancho > 0.001 && C == 2) {                                   // más o menos "lado" respecto al "centro"
            final double lado = 1 + ancho;
            for (int k = 0; k + 1 < cuantas; k += 2) { double m = (x[k] + x[k + 1]) / 2, sd = (x[k] - x[k + 1]) / 2 * lado; x[k] = (float) (m + sd); x[k + 1] = (float) (m - sd); }
        }
        if (Math.abs(balance) > 0.005 && C == 2) {                        // balance: baja el lado contrario, sin subir nada
            final float gi = (float) Math.min(1, 1 - balance), gd2 = (float) Math.min(1, 1 + balance);
            for (int k = 0; k + 1 < cuantas; k += 2) { x[k] *= gi; x[k + 1] *= gd2; }
        }
        if (cruce) {                                                     // crossfeed estilo Chu Moy (simplificado): cada oído recibe un poco de graves y medios del otro canal
            final double a = crossfeed, norm = 1.0 / (1.0 + a), kc = cfK;
            for (int k = 0; k + 1 < cuantas; k += 2) {
                double l = x[k], r = x[k + 1];
                cfBajo[0] += kc * (r - cfBajo[0]);                       // paso bajo del R
                cfBajo[1] += kc * (l - cfBajo[1]);                       // paso bajo del L
                x[k] = (float) ((l + a * cfBajo[0]) * norm);
                x[k + 1] = (float) ((r + a * cfBajo[1]) * norm);
            }
        }
        if (fase) for (int k = 0; k < cuantas; k++) x[k] = (float) (x[k] * -1.0);   // inversión de fase: antes del limitador
        for (int k = 0; k < cuantas; k++) x[k] = (float) limitar(x[k]);
    }
    /** Pasa limpio hasta 0,92; por encima curva suave hacia 1 (sin recorte duro). */
    static double limitar(double v) {
        double a = Math.abs(v); if (a <= 0.92) return v;
        double y = 0.92 + 0.08 * Math.tanh((a - 0.92) / 0.08);
        return v < 0 ? -y : y;
    }
}
