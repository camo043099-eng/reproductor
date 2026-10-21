// SIN COMPILAR AQUÍ. Ver oboe_output.h. Esqueleto con la lógica de llamadas de Oboe.
#include "oboe_output.h"
#include <vector>
// #include <oboe/Oboe.h>

namespace onda {

OboeSalida::OboeSalida(RingBuffer& fuente, EqCore& eq, int hz, int canales)
    : fuente_(fuente), eq_(eq), hz_(hz), canales_(canales) {}

bool OboeSalida::abrir() {
    // oboe::AudioStreamBuilder b;
    // b.setDirection(oboe::Direction::Output)
    //  ->setSharingMode(oboe::SharingMode::Exclusive)
    //  ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
    //  ->setFormat(oboe::AudioFormat::Float)
    //  ->setChannelCount(canales_)->setSampleRate(hz_)
    //  ->setDataCallback(this);            // onAudioReady abajo
    // if (b.openStream(stream_) != oboe::Result::OK) { /* reintentar con SharingMode::Shared */ }
    return false;
}

bool OboeSalida::iniciar() { return false; }
void OboeSalida::parar() {}

// Dentro del callback (hilo de audio, sin bloqueos):
//   float* out = static_cast<float*>(datos);
//   size_t n = frames * canales_;
//   fuente_.leer(out, n);          // relleno con silencio si falta audio
//   eq_.procesar(out, n);          // NucleoEq portado, in situ
//   return oboe::DataCallbackResult::Continue;

}  // namespace onda
