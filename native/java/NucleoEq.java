package com.camo.onda;

/** Ecualizador de 10 bandas con preamplificación y limitador suave. Trabaja en coma flotante (double) y no depende de Android. */
public final class NucleoEq {
    public static final int N = 10;
    public static final double[] F = {31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    private static final double Q = 1.1;

    private final double[] gdb = new double[N];
    private boolean eqOn = true;
    private double gananciaDb = 0;
    private volatile boolean sucio = true;
    private int canales = 2, hz = 44100;
    private double[][] coef = new double[N][5];                 // b0 b1 b2 a1 a2 (ya divididos por a0)
    private double[][][] estado = new double[2][N][4];          // [canal][banda]{x1,x2,y1,y2}
    private double lineal = 1;
    private boolean pasaTodo = true;

    public synchronized void configurar(int hz, int canales) {
        this.hz = hz; this.canales = Math.max(1, canales);
        this.estado = new double[this.canales][N][4];
        sucio = true;
    }
    public synchronized void reiniciar() { for (double[][] c : estado) for (double[] b : c) java.util.Arrays.fill(b, 0); sucio = true; }
    public synchronized void ponerBandas(double[] db, boolean activo) {
        for (int i = 0; i < N; i++) gdb[i] = i < db.length ? Math.max(-12, Math.min(12, db[i])) : 0;
        eqOn = activo; sucio = true;
    }
    public synchronized void ponerGananciaDb(double db) { gananciaDb = Math.max(-24, Math.min(12, db)); sucio = true; }

    private synchronized void recalcular() {
        lineal = Math.pow(10, gananciaDb / 20);
        boolean algunaBanda = false;
        for (int i = 0; i < N; i++) {
            if (!eqOn || Math.abs(gdb[i]) < 0.01 || F[i] >= hz / 2.0) { coef[i][0] = 1; coef[i][1] = coef[i][2] = coef[i][3] = coef[i][4] = 0; continue; }
            algunaBanda = true; calcular(i);
        }
        pasaTodo = !algunaBanda && Math.abs(gananciaDb) < 0.001;
        sucio = false;
    }
    /** fórmulas del "Audio EQ Cookbook" (Robert Bristow-Johnson): estante grave, picos y estante agudo */
    private void calcular(int i) {
        double A = Math.pow(10, gdb[i] / 40), w = 2 * Math.PI * F[i] / hz, cs = Math.cos(w), sn = Math.sin(w);
        double b0, b1, b2, a0, a1, a2;
        if (i == 0 || i == N - 1) {
            double S = 1, al = sn / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2), r = 2 * Math.sqrt(A) * al;
            if (i == 0) {
                b0 = A * ((A + 1) - (A - 1) * cs + r); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - r);
                a0 = (A + 1) + (A - 1) * cs + r; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - r;
            } else {
                b0 = A * ((A + 1) + (A - 1) * cs + r); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - r);
                a0 = (A + 1) - (A - 1) * cs + r; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - r;
            }
        } else {
            double al = sn / (2 * Q);
            b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
        }
        coef[i][0] = b0 / a0; coef[i][1] = b1 / a0; coef[i][2] = b2 / a0; coef[i][3] = a1 / a0; coef[i][4] = a2 / a0;
    }

    /** Procesa muestras entrelazadas (valores entre -1 y 1) en el mismo arreglo. */
    public void procesar(float[] x, int cuantas) {
        if (sucio) recalcular();
        if (pasaTodo) return;
        final int C = canales; final double g = lineal;
        for (int k = 0; k < cuantas; k++) {
            int c = k % C; double v = x[k] * g;
            double[][] est = estado[c];
            for (int b = 0; b < N; b++) {
                double[] co = coef[b];
                if (co[1] == 0 && co[0] == 1 && co[2] == 0 && co[3] == 0 && co[4] == 0) continue;
                double[] s = est[b];
                double y = co[0] * v + co[1] * s[0] + co[2] * s[1] - co[3] * s[2] - co[4] * s[3];
                s[1] = s[0]; s[0] = v; s[3] = s[2]; s[2] = y; v = y;
            }
            x[k] = (float) limitar(v);
        }
    }
    /** Pasa limpio hasta 0,92; por encima curva suave hacia 1 (sin recorte duro). */
    static double limitar(double v) {
        double a = Math.abs(v); if (a <= 0.92) return v;
        double y = 0.92 + 0.08 * Math.tanh((a - 0.92) / 0.08);
        return v < 0 ? -y : y;
    }
}
