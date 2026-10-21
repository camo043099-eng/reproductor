// SIN COMPILAR AQUÍ (requiere Oboe del NDK). Salida en modo exclusivo con callback que consume RingBuffer
// y aplica EqCore antes de entregar al DAC. Si la salida exclusiva falla, reintenta en modo compartido.
#pragma once
#include <memory>
#include "eq_core.h"
#include "ring_buffer.h"

namespace onda {

class OboeSalida {
public:
    OboeSalida(RingBuffer& fuente, EqCore& eq, int hz, int canales);
    bool abrir();                 // exclusivo y float; si no, compartido
    bool iniciar();
    void parar();
    // oboe::DataCallbackResult onAudioReady(oboe::AudioStream*, void* datos, int32_t frames) — implementar con Oboe
    // dentro: leer `frames*canales` de fuente_, eq_.procesar(), y escribir en `datos` (float).
private:
    RingBuffer& fuente_;
    EqCore& eq_;
    int hz_, canales_;
    // std::shared_ptr<oboe::AudioStream> stream_;  // ← al implementar con Oboe
};

}  // namespace onda
