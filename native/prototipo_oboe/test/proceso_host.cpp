// Prueba en el host: procesa un raw float32 estéreo con EqCore y escribe la salida.
// Uso: proceso_host entrada.raw salida.raw [fase:0|1]
#include "../eq_core.h"
#include <cstdio>
#include <cstring>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "uso: %s entrada.raw salida.raw [fase]\n", argv[0]); return 2; }
    bool fase = argc > 3 && std::strcmp(argv[3], "1") == 0;

    FILE* f = std::fopen(argv[1], "rb");
    if (!f) { std::perror("entrada"); return 1; }
    std::vector<float> x;
    float buf[4096];
    size_t n;
    while ((n = std::fread(buf, sizeof(float), 4096, f)) > 0) x.insert(x.end(), buf, buf + n);
    std::fclose(f);

    onda::EqCore eq;
    eq.configurar(48000, 2);
    eq.anadirPico(1000, 6, 1.0);
    eq.ponerCrossfeed(0.3);
    eq.ponerFaseInvertida(fase);

    const std::size_t trozo = 1024 * 2;   // mismo bloque que la referencia Java
    for (std::size_t p = 0; p < x.size(); p += trozo) {
        std::size_t m = std::min(trozo, x.size() - p);
        eq.procesar(x.data() + p, m);
    }

    FILE* o = std::fopen(argv[2], "wb");
    if (!o) { std::perror("salida"); return 1; }
    std::fwrite(x.data(), sizeof(float), x.size(), o);
    std::fclose(o);
    std::printf("procesadas %zu muestras\n", x.size());
    return 0;
}
