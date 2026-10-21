#include "eq_core.h"
#include <algorithm>
#include <cmath>

namespace onda {

void EqCore::configurar(int hz, int canales) {
    hz_ = hz;
    canales_ = std::max(1, canales);
    estado_.assign(canales_, std::vector<Estado>(picos_.size()));
    cfK_ = 1.0 - std::exp(-2.0 * M_PI * 700.0 / std::max(8000, hz_));
    cfBajo_[0] = cfBajo_[1] = 0;
    rampaTot_ = std::max(1, hz_ / 80);
    rampa_ = rampaTot_;
    primera_ = true;
    sucio_ = true;
}

void EqCore::reiniciar() {
    for (auto& c : estado_) std::fill(c.begin(), c.end(), Estado{});
    cfBajo_[0] = cfBajo_[1] = 0;
    rampa_ = rampaTot_;
    primera_ = true;
    sucio_ = true;
}

void EqCore::anadirPico(double f, double db, double q) {
    picos_.push_back({std::max(15.0, std::min(20000.0, f)),
                      std::max(-18.0, std::min(18.0, db)),
                      std::max(0.1, std::min(18.0, q))});
    sucio_ = true;
    configurar(hz_, canales_);   // reserva estados para el nuevo filtro
}

void EqCore::ponerCrossfeed(double m) { crossfeed_ = std::max(0.0, std::min(0.6, m)); }
void EqCore::ponerFaseInvertida(bool on) { fase_ = on; }

// Fórmulas RBJ para peaking, idénticas a NucleoEq.calcular() con tipo PICO.
void EqCore::recalcular() {
    filtros_.clear();
    for (const Pico& p : picos_) {
        double A = std::pow(10.0, p.db / 40.0);
        double w = 2.0 * M_PI * p.f / hz_, cs = std::cos(w), sn = std::sin(w);
        double al = sn / (2.0 * p.q);
        double b0 = 1 + al * A, b1 = -2 * cs, b2 = 1 - al * A;
        double a0 = 1 + al / A, a1 = -2 * cs, a2 = 1 - al / A;
        filtros_.push_back({b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0});
    }
    // Margen automático: igual que NucleoEq.recalcular() (240 frecuencias log entre 20 Hz y Nyquist).
    double maxDb = 0;
    if (!filtros_.empty()) {
        for (int k = 0; k < 240; k++) {
            double f = 20.0 * std::pow(1000.0, k / 239.0);
            if (f >= hz_ / 2.0) break;
            double w = 2.0 * M_PI * f / hz_, c1 = std::cos(w), s1 = std::sin(w), c2 = std::cos(2 * w), s2 = std::sin(2 * w);
            double mag2 = 1;
            for (const Biquad& c : filtros_) {
                double nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
                double dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
                mag2 *= (nr * nr + ni * ni) / (dr * dr + di * di);
            }
            maxDb = std::max(maxDb, 10 * std::log10(mag2));
        }
    }
    lineal_ = std::pow(10.0, (0.0 - std::min(9.0, maxDb)) / 20.0);
    sucio_ = false;
}

double EqCore::limitar(double v) {
    double a = std::fabs(v);
    if (a <= 0.92) return v;
    double y = 0.92 + 0.08 * std::tanh((a - 0.92) / 0.08);
    return v < 0 ? -y : y;
}

void EqCore::procesar(float* x, std::size_t muestras) {
    if (sucio_) recalcular();
    if (primera_) { gAct_ = lineal_; primera_ = false; }
    const double kG = 1.0 - std::exp(-1.0 / (0.02 * std::max(8000, hz_)));
    const int C = canales_;
    const double g = lineal_;

    // 1) filtros + ganancia + rampa de entrada (por muestra, como en Java: float al final de cada muestra)
    for (std::size_t k = 0; k < muestras; k++) {
        int c = static_cast<int>(k % C);
        if (c == 0) { gAct_ += (g - gAct_) * kG; if (std::fabs(g - gAct_) < 1e-7) gAct_ = g; }
        double v = x[k] * gAct_;
        for (std::size_t b = 0; b < filtros_.size(); b++) {
            const Biquad& co = filtros_[b];
            Estado& s = estado_[c][b];
            double y = co.b0 * v + co.b1 * s.x1 + co.b2 * s.x2 - co.a1 * s.y1 - co.a2 * s.y2;
            s.x2 = s.x1; s.x1 = v; s.y2 = s.y1; s.y1 = y; v = y;
        }
        if (rampa_ > 0) { v *= 1.0 - static_cast<double>(rampa_) / rampaTot_; if (c == C - 1) rampa_--; }
        x[k] = static_cast<float>(v);
    }

    // 2) crossfeed (estéreo): cada oído recibe graves/medios del otro canal
    if (crossfeed_ > 0.001 && C == 2) {
        const double a = crossfeed_, norm = 1.0 / (1.0 + a);
        for (std::size_t k = 0; k + 1 < muestras; k += 2) {
            double l = x[k], r = x[k + 1];
            cfBajo_[0] += cfK_ * (r - cfBajo_[0]);
            cfBajo_[1] += cfK_ * (l - cfBajo_[1]);
            x[k]     = static_cast<float>((l + a * cfBajo_[0]) * norm);
            x[k + 1] = static_cast<float>((r + a * cfBajo_[1]) * norm);
        }
    }

    // 3) fase invertida (antes del limitador) y 4) limitador suave
    for (std::size_t k = 0; k < muestras; k++) {
        float v = fase_ ? static_cast<float>(x[k] * -1.0) : x[k];
        x[k] = static_cast<float>(limitar(v));
    }
}

}  // namespace onda
