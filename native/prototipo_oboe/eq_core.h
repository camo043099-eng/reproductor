// Prototipo Hi-Res nativo — núcleo DSP en C++ (port de native/java/NucleoEq.java).
// Sin dependencias de Android: se compila y se prueba en el host.
// Incluye: filtros peaking, estantes grave y agudo (tono), margen automático de ganancia,
// rampa de entrada, ancho estéreo, balance, crossfeed, inversión de fase y limitador suave.
// NO incluye todavía: realce de MP3 (ponerRealce).
#pragma once
#include <cstddef>
#include <vector>

namespace onda {

class EqCore {
public:
    enum Tipo { PICO = 0, ESTANTE_GRAVE = 1, ESTANTE_AGUDO = 2 };

    void configurar(int hz, int canales);
    void reiniciar();                                   // flush / reset: limpia estados
    // Filtro del usuario (como ponerFiltros). Q (0,1..18), dB (-18..18).
    void anadirFiltro(double frecuenciaHz, double db, double q, Tipo tipo = PICO);
    // Tono: graves y agudos en dB (-12..12) con frecuencia y Q de los estantes.
    void ponerTono(double graves, double agudos);
    void ponerTonoAjuste(double fGraves, double qGraves, double fAgudos, double qAgudos);
    void ponerBalance(double balance);                  // -1..1
    void ponerAncho(double ancho);                      // 0..1
    void ponerCrossfeed(double mezcla);                 // 0..0,6
    void ponerFaseInvertida(bool on);
    void ponerRealce(double mezcla);                    // 0..0,3: regenera brillo de MP3 de baja calidad
    // Procesa `muestras` valores intercalados (estéreo), in situ. Igual que NucleoEq.procesar().
    void procesar(float* x, std::size_t muestras);

private:
    struct Biquad { double b0, b1, b2, a1, a2; };
    struct Estado { double x1 = 0, x2 = 0, y1 = 0, y2 = 0; };
    struct Filtro { double f, db, q; Tipo tipo; };

    Biquad calcular(double f, double db, double q, Tipo tipo) const;
    void recalcular();
    static double limitar(double v);

    int hz_ = 48000, canales_ = 2;
    std::vector<Filtro> usuario_;
    double graves_ = 0, agudos_ = 0, balance_ = 0, ancho_ = 0, crossfeed_ = 0;
    double fG_ = 120, qG_ = 0.7, fA_ = 6000, qA_ = 0.7;
    bool fase_ = false;

    std::vector<Biquad> activos_;                       // filtros con efecto, en el orden de NucleoEq
    std::vector<std::vector<Estado>> estado_;           // [canal][filtro]
    double lineal_ = 1.0, gAct_ = 1.0, cfK_ = 0, cfBajo_[2] = {0, 0};
    bool sucio_ = true, primera_ = true;
    int rampa_ = 0, rampaTot_ = 1;
    double realce_ = 0, hp_[2][4] = {{0,0,0,0},{0,0,0,0}};   // estado del realce: [canal]{x1,y1,x1,y1}
};

}  // namespace onda
