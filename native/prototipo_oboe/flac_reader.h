// SIN COMPILAR AQUÍ (requiere libFLAC del NDK). Decodifica un FLAC y empuja float32 intercalado al RingBuffer.
// 24 bits → float exacto (÷ 2^23), igual que EqProcesador.queueInput().
#pragma once
#include <atomic>
#include <string>
#include "ring_buffer.h"

namespace onda {

class FlacReader {
public:
    FlacReader(const std::string& ruta, RingBuffer& destino);
    ~FlacReader();
    bool abrir();                 // lee STREAMINFO: sampleRate, canales, bits
    void correr();                // bucle de decodificación (hilo productor); termina al acabar o al pedir parar
    void parar() { detener_ = true; }
    int hz() const { return hz_; }
    int canales() const { return canales_; }
    int bits() const { return bits_; }

private:
    std::string ruta_;
    RingBuffer& destino_;
    void* decoder_ = nullptr;     // FLAC__StreamDecoder*
    int hz_ = 0, canales_ = 0, bits_ = 0;
    std::atomic<bool> detener_{false};
};

}  // namespace onda
