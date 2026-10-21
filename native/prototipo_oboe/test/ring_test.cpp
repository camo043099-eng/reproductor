#include "../ring_buffer.h"
#include <cstdio>
#include <vector>
int main() {
    onda::RingBuffer rb(1000);
    std::vector<float> in(3000), out;
    for (size_t i = 0; i < in.size(); i++) in[i] = (float)i;
    size_t pos = 0; bool ok = true;
    while (pos < in.size() || rb.disponibles() > 0) {
        size_t w = rb.escribir(in.data() + pos, std::min<size_t>(777, in.size() - pos));
        pos += w;
        float tmp[500]; size_t r = rb.leer(tmp, 500);
        out.insert(out.end(), tmp, tmp + r);
    }
    for (size_t i = 0; i < out.size(); i++) if (out[i] != in[i]) { ok = false; break; }
    std::printf("ring: entrada=%zu salida=%zu orden_correcto=%s\n", in.size(), out.size(), ok && out.size()==in.size() ? "si" : "NO");
    float z[4]; onda::RingBuffer vacio(8); vacio.leer(z, 4);
    std::printf("vacio rellena silencio: %s\n", z[0]==0 && z[3]==0 ? "si" : "NO");
    return ok && out.size()==in.size() ? 0 : 1;
}
