# Prototipo Hi-Res nativo (Oboe + NucleoEq)

Prototipo aparte de la app para reproducir FLAC de 24 bits **con el ecualizador activo**, sin pasar por
`DefaultAudioSink` de Media3. No está enlazado en el build de la app.

## Estado

| Parte | Archivo | Estado |
|---|---|---|
| Núcleo DSP (biquads, margen, rampa, crossfeed, fase, limitador) | `eq_core.cpp` | **Verificado** en el host: coincide con `NucleoEq.java` (diferencia máxima 0) con y sin fase |
| Buffer circular SPSC | `ring_buffer.h` | **Verificado** en el host (orden, relleno con silencio) |
| Decodificador libFLAC → float | `flac_reader.cpp` | Esqueleto, **sin compilar** (sin cabeceras de libFLAC aquí) |
| Salida Oboe exclusiva con callback | `oboe_output.cpp` | Esqueleto, **sin compilar** (sin Oboe ni NDK aquí) |
| Build Android | `CMakeLists.txt` | Sin probar; no está enlazado en la app |

Lo que **no** incluye todavía el port: estantes grave y agudo, balance, ancho estéreo y realce.
Solo hay filtros peaking. Hay que portarlos antes de usar este motor con ajustes completos.

## Verificar en el host

```
native/prototipo_oboe/test/run_host.sh
```

Genera un FLAC de 24 bits con ffmpeg, lo procesa con `NucleoEq` (Java) y con `EqCore` (C++) y compara
las salidas, con fase apagada y encendida. Requiere g++, javac, ffmpeg y python3.

## Qué falta para probarlo en el teléfono

1. Escribir `flac_reader.cpp` con la API real de libFLAC (`init_file`, callback de escritura, STREAMINFO).
2. Implementar `oboe_output.cpp` con `AudioStreamBuilder` (exclusivo, float, con reintento en compartido).
3. Fijar versiones de Oboe y libFLAC en `CMakeLists.txt`.
4. Puente JNI y una pantalla de prueba que reproduzca un FLAC de 24 bits con el ecualizador en +6 dB a 1 kHz.
5. Comprobar la salida con `adb shell dumpsys media.audio_flinger`.
