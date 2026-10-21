// Prueba en el host: procesa un raw float32 estéreo con EqCore.
// Uso: proceso_host entrada.raw salida.raw <fase:0|1> <modo:basico|completo>
#include "../eq_core.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 5) { std::fprintf(stderr, "uso: %s entrada.raw salida.raw fase(0|1) modo(basico|completo)\n", argv[0]); return 2; }
    const bool fase = std::strcmp(argv[3], "1") == 0;
    const bool completo = std::strcmp(argv[4], "completo") == 0;

    FILE* f = std::fopen(argv[1], "rb");
    if (!f) { std::perror("entrada"); return 1; }
    std::vector<float> x; float buf[4096]; size_t n;
    while ((n = std::fread(buf, sizeof(float), 4096, f)) > 0) x.insert(x.end(), buf, buf + n);
    std::fclose(f);

    onda::EqCore eq;
    eq.configurar(48000, 2);
    eq.anadirFiltro(1000, 6, 1.0);
    if (completo) {
        eq.anadirFiltro(3000, -4, 2.0);
        eq.ponerTono(4, -3);
        eq.ponerBalance(0.3);
        eq.ponerAncho(0.5);
    }
    eq.ponerCrossfeed(0.3);
    eq.ponerFaseInvertida(fase);

    const std::size_t trozo = 1024 * 2;
    for (std::size_t p = 0; p < x.size(); p += trozo)
        eq.procesar(x.data() + p, std::min(trozo, x.size() - p));

    FILE* o = std::fopen(argv[2], "wb");
    if (!o) { std::perror("salida"); return 1; }
    std::fwrite(x.data(), sizeof(float), x.size(), o);
    std::fclose(o);
    return 0;
}
