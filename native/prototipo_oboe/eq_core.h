// Prototipo Hi-Res nativo — núcleo DSP en C++ (port de native/java/NucleoEq.java).
// Sin dependencias de Android: se compila y se prueba en el host.
// Alcance del prototipo: filtros peaking (RBJ), margen automático de ganancia, rampa de entrada,
// crossfeed, inversión de fase y limitador suave. NO incluye todavía estantes grave/agudo, balance,
// ancho estéreo ni realce; el NucleoEq de Java sí los tiene.
#pragma once
#include <cstddef>
#include <vector>

namespace onda {

class EqCore {
public:
    // Configura la frecuencia de muestreo y los canales (2 en el prototipo). Reinicia el estado.
    void configurar(int hz, int canales);
    // Añade un filtro peaking RBJ (Audio EQ Cookbook). Q en (0.1, 18), dB en (-18, 18).
    void anadirPico(double frecuenciaHz, double db, double q);
    void ponerCrossfeed(double mezcla);     // 0..0,6
    void ponerFaseInvertida(bool on);
    void reiniciar();                       // limpia estados de filtros (flush / reset)
    // Procesa `frames` tramas estéreo intercaladas, in situ. Igual que NucleoEq.procesar().
    void procesar(float* x, std::size_t muestras);

private:
    struct Biquad { double b0, b1, b2, a1, a2; };
    struct Estado { double x1 = 0, x2 = 0, y1 = 0, y2 = 0; };

    void recalcular();
    static double limitar(double v);

    int hz_ = 48000, canales_ = 2;
    std::vector<Biquad> filtros_;
    std::vector<std::vector<Estado>> estado_;   // [canal][filtro]
    double lineal_ = 1.0, gAct_ = 1.0;
    bool sucio_ = true, primera_ = true;
    int rampa_ = 0, rampaTot_ = 1;
    double crossfeed_ = 0, cfK_ = 0, cfBajo_[2] = {0, 0};
    bool fase_ = false;
    struct Pico { double f, db, q; };
    std::vector<Pico> picos_;
};

}  // namespace onda
