#include "eq_core.h"
#include <algorithm>
#include <cmath>

namespace onda {

void EqCore::configurar(int hz, int canales) {
    hz_ = hz; canales_ = std::max(1, canales);
    cfK_ = 1.0 - std::exp(-2.0 * M_PI * 700.0 / std::max(8000, hz_));
    rampaTot_ = std::max(1, hz_ / 80);
    reiniciar();
    sucio_ = true;
}

void EqCore::reiniciar() {
    estado_.assign(canales_, std::vector<Estado>(activos_.size()));
    cfBajo_[0] = cfBajo_[1] = 0;
    rampa_ = rampaTot_; primera_ = true; sucio_ = true;
}

void EqCore::anadirFiltro(double f, double db, double q, Tipo tipo) {
    usuario_.push_back({std::max(15.0, std::min(20000.0, f)), std::max(-18.0, std::min(18.0, db)),
                        std::max(0.1, std::min(18.0, q)), tipo});
    sucio_ = true;
}
void EqCore::ponerTono(double g, double a) { graves_ = std::max(-12.0, std::min(12.0, g)); agudos_ = std::max(-12.0, std::min(12.0, a)); sucio_ = true; }
void EqCore::ponerTonoAjuste(double fg, double qg, double fa, double qa) {
    fG_ = std::max(30.0, std::min(400.0, fg)); qG_ = std::max(0.3, std::min(2.0, qg));
    fA_ = std::max(2000.0, std::min(16000.0, fa)); qA_ = std::max(0.3, std::min(2.0, qa)); sucio_ = true;
}
void EqCore::ponerBalance(double b) { balance_ = std::max(-1.0, std::min(1.0, b)); sucio_ = true; }
void EqCore::ponerAncho(double a) { ancho_ = std::max(0.0, std::min(1.0, a)); sucio_ = true; }
void EqCore::ponerCrossfeed(double m) { crossfeed_ = std::max(0.0, std::min(0.6, m)); }
void EqCore::ponerFaseInvertida(bool on) { fase_ = on; }
void EqCore::ponerRealce(double m) { realce_ = std::max(0.0, std::min(0.3, m)); }

// Audio EQ Cookbook (RBJ), igual que NucleoEq.calcular(): picos y estantes con S = 1.
EqCore::Biquad EqCore::calcular(double f, double db, double q, Tipo tipo) const {
    double A = std::pow(10.0, db / 40.0);
    double w = 2.0 * M_PI * f / hz_, cs = std::cos(w), sn = std::sin(w);
    double b0, b1, b2, a0, a1, a2;
    if (tipo == PICO) {
        double al = sn / (2.0 * q);
        b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    } else {
        double S = 1, al = sn / 2 * std::sqrt((A + 1 / A) * (1 / S - 1) + 2), r = 2 * std::sqrt(A) * al;
        if (tipo == ESTANTE_GRAVE) {
            b0 = A * ((A + 1) - (A - 1) * cs + r); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - r);
            a0 = (A + 1) + (A - 1) * cs + r; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - r;
        } else {
            b0 = A * ((A + 1) + (A - 1) * cs + r); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - r);
            a0 = (A + 1) - (A - 1) * cs + r; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - r;
        }
    }
    return {b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0};
}

void EqCore::recalcular() {
    // Mismo orden que NucleoEq: filtros del usuario, luego estante grave y estante agudo.
    struct Entrada { double f, db, q; Tipo t; };
    std::vector<Entrada> lista;
    for (const Filtro& u : usuario_) if (std::fabs(u.db) >= 0.01) lista.push_back({u.f, u.db, u.q, u.tipo});
    if (std::fabs(graves_) >= 0.01 && fG_ < hz_ / 2.0) lista.push_back({fG_, graves_, qG_, ESTANTE_GRAVE});
    if (std::fabs(agudos_) >= 0.01 && fA_ < hz_ / 2.0) lista.push_back({fA_, agudos_, qA_, ESTANTE_AGUDO});

    activos_.clear();
    for (const Entrada& e : lista) activos_.push_back(calcular(e.f, e.db, e.q, e.t));

    // Margen automático: 240 frecuencias log entre 20 Hz y Nyquist, igual que NucleoEq.
    double maxDb = 0;
    if (!activos_.empty()) {
        for (int k = 0; k < 240; k++) {
            double f = 20.0 * std::pow(1000.0, k / 239.0);
            if (f >= hz_ / 2.0) break;
            double w = 2.0 * M_PI * f / hz_, c1 = std::cos(w), s1 = std::sin(w), c2 = std::cos(2 * w), s2 = std::sin(2 * w);
            double mag2 = 1;
            for (const Biquad& c : activos_) {
                double nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
                double dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
                mag2 *= (nr * nr + ni * ni) / (dr * dr + di * di);
            }
            maxDb = std::max(maxDb, 10 * std::log10(mag2));
        }
    }
    lineal_ = std::pow(10.0, (0.0 - std::min(9.0, maxDb)) / 20.0);
    // Conserva el estado de los filtros al cambiar ajustes (como NucleoEq); solo redimensiona si cambia su número.
    if (estado_.size() != static_cast<std::size_t>(canales_) || (!estado_.empty() && estado_[0].size() != activos_.size()))
        estado_.assign(canales_, std::vector<Estado>(activos_.size()));
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

    // 1) filtros, ganancia y rampa de entrada (por muestra; float tras cada muestra, como en Java)
    for (std::size_t k = 0; k < muestras; k++) {
        int c = static_cast<int>(k % C);
        if (c == 0) { gAct_ += (g - gAct_) * kG; if (std::fabs(g - gAct_) < 1e-7) gAct_ = g; }
        double v = x[k] * gAct_;
        for (std::size_t b = 0; b < activos_.size(); b++) {
            const Biquad& co = activos_[b];
            Estado& s = estado_[c][b];
            double y = co.b0 * v + co.b1 * s.x1 + co.b2 * s.x2 - co.a1 * s.y1 - co.a2 * s.y2;
            s.x2 = s.x1; s.x1 = v; s.y2 = s.y1; s.y1 = y; v = y;
        }
        if (realce_ > 0 && c < 2) {                       // regenera brillo recortado por el MP3 (igual que NucleoEq)
            const double a = 1.0 / (1.0 + 2 * M_PI * 5000.0 / std::max(8000, hz_));
            double* h = hp_[c];
            double e = a * (h[1] + v - h[0]); h[0] = v; h[1] = e;
            double g2 = std::tanh(3 * e), d = a * (h[3] + g2 - h[2]); h[2] = g2; h[3] = d;
            v += realce_ * d;
        }
        if (rampa_ > 0) { v *= 1.0 - static_cast<double>(rampa_) / rampaTot_; if (c == C - 1) rampa_--; }
        x[k] = static_cast<float>(v);
    }

    // 2) ancho estéreo (lado), 3) balance (en float, como en Java)
    if (ancho_ > 0.001 && C == 2) {
        const double lado = 1 + ancho_;
        for (std::size_t k = 0; k + 1 < muestras; k += 2) {
            double m = (x[k] + x[k + 1]) / 2, sd = (x[k] - x[k + 1]) / 2 * lado;
            x[k] = static_cast<float>(m + sd); x[k + 1] = static_cast<float>(m - sd);
        }
    }
    if (std::fabs(balance_) > 0.005 && C == 2) {
        const float gi = static_cast<float>(std::min(1.0, 1 - balance_)), gd = static_cast<float>(std::min(1.0, 1 + balance_));
        for (std::size_t k = 0; k + 1 < muestras; k += 2) { x[k] *= gi; x[k + 1] *= gd; }
    }

    // 4) crossfeed, 5) fase, 6) limitador
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
    for (std::size_t k = 0; k < muestras; k++) {
        float v = fase_ ? static_cast<float>(x[k] * -1.0) : x[k];
        x[k] = static_cast<float>(limitar(v));
    }
}

}  // namespace onda
