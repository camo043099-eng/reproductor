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

    @Override
    protected AudioFormat onConfigure(AudioFormat in) throws UnhandledAudioFormatException {
        enc = in.encoding;
        if (enc != C.ENCODING_PCM_16BIT && enc != C.ENCODING_PCM_24BIT && enc != C.ENCODING_PCM_32BIT && enc != C.ENCODING_PCM_FLOAT) throw new UnhandledAudioFormatException(in);
        nucleo.configurar(in.sampleRate, in.channelCount);
        return new AudioFormat(in.sampleRate, in.channelCount, salida16 ? C.ENCODING_PCM_16BIT : C.ENCODING_PCM_FLOAT);
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int bytes = enc == C.ENCODING_PCM_16BIT ? 2 : enc == C.ENCODING_PCM_24BIT ? 3 : 4;
        int n = input.remaining() / bytes;
        if (n == 0) return;
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
