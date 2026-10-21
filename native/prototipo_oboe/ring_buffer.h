// Buffer circular SPSC (un productor, un consumidor) para pasar audio del decodificador al callback de Oboe.
// Sin bloqueos ni reservas de memoria en el lado del consumidor: seguro para el hilo de audio.
#pragma once
#include <algorithm>
#include <atomic>
#include <cstddef>
#include <vector>

namespace onda {

class RingBuffer {
public:
    explicit RingBuffer(std::size_t capacidad) : buf_(capacidad + 1) {}

    // Productor: escribe hasta `n` muestras; devuelve cuántas cupieron.
    std::size_t escribir(const float* src, std::size_t n) {
        const std::size_t cap = buf_.size();
        const std::size_t w = escrito_.load(std::memory_order_relaxed);
        const std::size_t r = leido_.load(std::memory_order_acquire);
        const std::size_t libre = (r + cap - w - 1) % cap;
        const std::size_t m = std::min(n, libre);
        for (std::size_t i = 0; i < m; i++) buf_[(w + i) % cap] = src[i];
        escrito_.store((w + m) % cap, std::memory_order_release);
        return m;
    }

    // Consumidor: lee hasta `n` muestras; rellena con silencio lo que falte. Devuelve cuántas eran reales.
    std::size_t leer(float* dst, std::size_t n) {
        const std::size_t cap = buf_.size();
        const std::size_t r = leido_.load(std::memory_order_relaxed);
        const std::size_t w = escrito_.load(std::memory_order_acquire);
        const std::size_t disp = (w + cap - r) % cap;
        const std::size_t m = std::min(n, disp);
        for (std::size_t i = 0; i < m; i++) dst[i] = buf_[(r + i) % cap];
        for (std::size_t i = m; i < n; i++) dst[i] = 0.0f;
        leido_.store((r + m) % cap, std::memory_order_release);
        return m;
    }

    std::size_t disponibles() const {
        const std::size_t cap = buf_.size();
        return (escrito_.load(std::memory_order_acquire) + cap - leido_.load(std::memory_order_acquire)) % cap;
    }

private:
    std::vector<float> buf_;
    std::atomic<std::size_t> escrito_{0}, leido_{0};
};

}  // namespace onda
