package com.camo.onda;

/**
 * Reverberación (estilo Freeverb: 8 peines + 4 filtros de paso total por canal) con preretardo.
 * Trabaja sobre audio intercalado (L,R,L,R…). Con mezcla 0 no toca la señal (pasa idéntica).
 * No depende de Android.
 */
final class Reverb {
    private static final int[] PEINE = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
    private static final int[] PASO = {556, 441, 341, 225};
    private static final int DESF = 23;                      // desfase del canal derecho (más amplio)
    private static final double GAN_ENTRADA = 0.015, ESCALA_SALIDA = 3.0;

    private volatile double mezcla = 0, tamano = 0.5, amort = 0.5, preMs = 0;   // mezcla 0..1, tamaño 0..1, amortiguación 0..1, preretardo ms
    private int hz = 44100, canales = 2;
    private double[][][] peine; private int[][] idxPeine; private double[][] filtro;
    private double[][][] paso; private int[][] idxPaso;
    private double[][] pre; private int idxPre, tamPre;

    void configurar(int hz, int canales) {
        this.hz = Math.max(8000, hz); this.canales = Math.max(1, Math.min(2, canales));
        peine = new double[this.canales][PEINE.length][]; idxPeine = new int[this.canales][PEINE.length]; filtro = new double[this.canales][PEINE.length];
        paso = new double[this.canales][PASO.length][]; idxPaso = new int[this.canales][PASO.length];
        for (int c = 0; c < this.canales; c++) {
            int desf = c == 1 ? escala(DESF) : 0;
            for (int i = 0; i < PEINE.length; i++) peine[c][i] = new double[escala(PEINE[i]) + desf];
            for (int i = 0; i < PASO.length; i++) paso[c][i] = new double[escala(PASO[i]) + desf];
        }
        tamPre = (int) (0.25 * this.hz) + 2; pre = new double[this.canales][tamPre]; idxPre = 0;
    }
    private int escala(int muestras) { return Math.max(1, (int) Math.round(muestras * hz / 44100.0)); }

    void copiarParametros(Reverb o) { mezcla = o.mezcla; tamano = o.tamano; amort = o.amort; preMs = o.preMs; }
    void ponerParametros(double mz, double tam, double am, double pre) {
        mezcla = clamp(mz, 0, 1); tamano = clamp(tam, 0, 1); amort = clamp(am, 0, 1); preMs = clamp(pre, 0, 200);
    }
    boolean activo() { return mezcla > 0.001; }
    void reiniciar() {
        if (peine == null) return;
        for (double[][] c : peine) for (double[] b : c) java.util.Arrays.fill(b, 0);
        for (double[][] c : paso) for (double[] b : c) java.util.Arrays.fill(b, 0);
        for (double[] c : pre) java.util.Arrays.fill(c, 0);
        for (double[] f : filtro) java.util.Arrays.fill(f, 0);
        idxPre = 0;
    }

    /** Procesa `n` muestras intercaladas con `C` canales (1 o 2). */
    void procesar(float[] x, int n, int C) {
        if (peine == null || C > 2 || C != canales || !activo()) return;
        final double m = mezcla, fb = 0.7 + tamano * 0.28, damp = amort * 0.4;
        final int retardo = (int) Math.round(preMs * hz / 1000.0);
        for (int k = 0; k + C - 1 < n; k += C) {
            for (int c = 0; c < C; c++) {
                double in = x[k + c];
                // preretardo: la cola empieza después de `retardo` muestras
                double[] p = pre[c]; p[idxPre] = in;
                double ent = retardo <= 0 ? in : p[(idxPre - retardo + tamPre) % tamPre];
                double entrada = ent * GAN_ENTRADA, salida = 0;
                for (int i = 0; i < PEINE.length; i++) {
                    double[] b = peine[c][i]; int j = idxPeine[c][i];
                    double y = b[j];
                    filtro[c][i] = y * (1 - damp) + filtro[c][i] * damp;
                    b[j] = entrada + filtro[c][i] * fb;
                    idxPeine[c][i] = (j + 1) % b.length;
                    salida += y;
                }
                for (int i = 0; i < PASO.length; i++) {
                    double[] b = paso[c][i]; int j = idxPaso[c][i];
                    double bo = b[j];
                    double t = salida;
                    salida = -t + bo;
                    b[j] = t + bo * 0.5;
                    idxPaso[c][i] = (j + 1) % b.length;
                }
                x[k + c] = (float) ((1 - m) * in + m * salida * ESCALA_SALIDA);
            }
            idxPre = (idxPre + 1) % tamPre;
        }
    }
    private static double clamp(double v, double a, double b) { return Math.max(a, Math.min(b, v)); }
}
