// SIN COMPILAR AQUÍ. Ver flac_reader.h.
#include "flac_reader.h"
#include <chrono>
#include <thread>
#include <FLAC/stream_decoder.h>

namespace onda {

FlacReader::FlacReader(const std::string& ruta, RingBuffer& destino) : ruta_(ruta), destino_(destino) {}
FlacReader::~FlacReader() {
    if (decoder_) { FLAC__stream_decoder_delete(static_cast<FLAC__StreamDecoder*>(decoder_)); decoder_ = nullptr; }
}

bool FlacReader::abrir() {
    auto* d = FLAC__stream_decoder_new();
    if (!d) return false;
    decoder_ = d;
    FLAC__stream_decoder_set_metadata_respond(d, FLAC__METADATA_TYPE_STREAMINFO);
    // init_file se hace en correr(); STREAMINFO se leerá en el callback de metadatos.
    return true;
}

void FlacReader::correr() {
    // Esqueleto: init_file(decoder_, ruta_, write_cb, metadata_cb, error_cb, this) y después
    // FLAC__stream_decoder_process_until_end_of_stream(). En write_cb:
    //   escala = 1.0f / (float)(1 << (frame->header.bits_per_sample - 1));
    //   intercala buffer[ch][i] * escala y llama destino_.escribir(...) en bucle hasta vaciar el bloque,
    //   esperando (sleep corto) si el buffer está lleno y detener_ no está activo.
    (void)ruta_;
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
}

}  // namespace onda
