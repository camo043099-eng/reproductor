package com.camo.onda;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Pone el ecualizador y la ganancia en la ruta del audio de ExoPlayer. Siempre entrega 32 bits flotantes (no pierde nada de un FLAC de 24 bits). */
@UnstableApi
public final class EqProcesador extends BaseAudioProcessor {
    public final NucleoEq nucleo = new NucleoEq();
    /** si el teléfono no acepta audio de 32 bits, se entrega de 16 bits (se activa solo tras un fallo) */
    public static volatile boolean salida16 = false;
    private int enc = C.ENCODING_PCM_16BIT;
    private float[] tmp = new float[0];
    /** nivel del audio (0..1) para animar la carátula al ritmo: graves y total del último bloque */
    public static volatile float nivelBajo = 0, nivelTotal = 0;
    /** datos para la pantalla "Información de audio" */
    public static volatile String entradaTxt = ""; public static volatile int entradaHz = 0, entradaCanales = 0; public static volatile long ultimoBloque = 0;
    private final double[] eb = new double[8];
    private double lp = 0, lpK = 0.02;
    /** energía en 8 bandas de frecuencia (graves → agudos) para las barras de colores */
    public static final float[] bandas = new float[8];
    private static final double[] CORTES = {80, 200, 500, 1200, 3000, 6000, 10000};
    private final double[] kb = new double[7], lb = new double[7];

    @Override
    protected AudioFormat onConfigure(AudioFormat in) throws UnhandledAudioFormatException {
        enc = in.encoding; entradaHz = in.sampleRate; entradaCanales = in.channelCount; entradaTxt = enc == C.ENCODING_PCM_16BIT ? "PCM 16 bits" : enc == C.ENCODING_PCM_24BIT ? "PCM 24 bits" : enc == C.ENCODING_PCM_32BIT ? "PCM 32 bits" : enc == C.ENCODING_PCM_FLOAT ? "PCM flotante 32 bits" : "otro";
        if (enc != C.ENCODING_PCM_16BIT && enc != C.ENCODING_PCM_24BIT && enc != C.ENCODING_PCM_32BIT && enc != C.ENCODING_PCM_FLOAT) throw new UnhandledAudioFormatException(in);
        nucleo.configurar(in.sampleRate, in.channelCount); lpK = 1 - Math.exp(-2 * Math.PI * 140.0 / Math.max(8000, in.sampleRate)); for (int i = 0; i < 7; i++) kb[i] = 1 - Math.exp(-2 * Math.PI * CORTES[i] / Math.max(8000, in.sampleRate));
        return new AudioFormat(in.sampleRate, in.channelCount, salida16 ? C.ENCODING_PCM_16BIT : C.ENCODING_PCM_FLOAT);
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int bytes = enc == C.ENCODING_PCM_16BIT ? 2 : enc == C.ENCODING_PCM_24BIT ? 3 : 4;
        int n = input.remaining() / bytes;
        if (n == 0) return;
        ultimoBloque = System.currentTimeMillis();
        if (tmp.length < n) tmp = new float[n];
        ByteBuffer in = input.duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int p = input.position();
        for (int i = 0; i < n; i++, p += bytes) {
            float v;
            if (enc == C.ENCODING_PCM_16BIT) v = in.getShort(p) / 32768f;
            else if (enc == C.ENCODING_PCM_24BIT) { int s = (in.get(p) & 0xFF) | ((in.get(p + 1) & 0xFF) << 8) | (in.get(p + 2) << 16); v = s / 8388608f; }
            else if (enc == C.ENCODING_PCM_32BIT) v = in.getInt(p) / 2147483648f;
            else v = in.getFloat(p);
            tmp[i] = v;
        }
        input.position(input.position() + n * bytes);
        nucleo.procesar(tmp, n);
        { int C = Math.max(1, inputAudioFormat.channelCount); double sb = 0, st = 0; int fr = n / C; java.util.Arrays.fill(eb, 0);
          for (int f = 0; f < fr; f++) { double m = 0; for (int c = 0; c < C; c++) m += tmp[f * C + c]; m /= C; lp += (m - lp) * lpK; sb += lp * lp; st += m * m; double prev = 0; for (int i = 0; i < 7; i++) { lb[i] += (m - lb[i]) * kb[i]; double b = lb[i] - prev; eb[i] += b * b; prev = lb[i]; } double b7 = m - prev; eb[7] += b7 * b7; }
          if (fr > 0) { for (int i = 0; i < 8; i++) bandas[i] = (float) Math.min(4, Math.sqrt(eb[i] / fr) * (1.6 + i * 0.6)); nivelBajo = (float) Math.min(4, Math.sqrt(sb / fr) * 2.0); nivelTotal = (float) Math.min(4, Math.sqrt(st / fr) * 1.6); } }
        if (salida16) {
            ByteBuffer out = replaceOutputBuffer(n * 2);
            for (int i = 0; i < n; i++) { float v = tmp[i] * 32767f; out.putShort((short) Math.max(-32768, Math.min(32767, Math.round(v)))); }
            out.flip();
        } else {
            ByteBuffer out = replaceOutputBuffer(n * 4);
            for (int i = 0; i < n; i++) out.putFloat(tmp[i]);
            out.flip();
        }
    }

    @Override protected void onFlush() { nucleo.reiniciar(); }
    @Override protected void onReset() { nucleo.reiniciar(); }
}
