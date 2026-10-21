#!/usr/bin/env bash
# Compara el port C++ (EqCore) con el NucleoEq real de Java sobre la misma señal.
# Requiere: g++, javac/java, ffmpeg, python3.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; raiz="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=0.4*sin(2*PI*440*t)+0.3*sin(2*PI*1000*t)|0.2*sin(2*PI*2500*t)+0.1*sin(2*PI*180*t):s=48000:d=2" \
  -ac 2 -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 "$work/p24.flac"
ffmpeg -hide_banner -loglevel error -y -i "$work/p24.flac" -f f32le -acodec pcm_f32le "$work/entrada.raw"
javac -d "$work/jcls" "$raiz/native/java/NucleoEq.java" "$here/test/ProcesoJava.java"
g++ -std=c++17 -O2 -Wall -Wextra -o "$work/proceso" "$here/eq_core.cpp" "$here/test/proceso_host.cpp"
g++ -std=c++17 -O2 -Wall -Wextra -pthread -o "$work/ring" "$here/test/ring_test.cpp"
"$work/ring"
for fase in 0 1; do
  java -cp "$work/jcls" com.camo.onda.ProcesoJava "$work/entrada.raw" "$work/ref$fase.raw" "$fase"
  "$work/proceso" "$work/entrada.raw" "$work/cpp$fase.raw" "$fase" >/dev/null
done
python3 - "$work" <<'PY'
import array, sys
w = sys.argv[1]
def leer(p):
    a = array.array('f'); a.frombytes(open(p,'rb').read()); return a
ok = True
for fase in ("0", "1"):
    r, c = leer(f"{w}/ref{fase}.raw"), leer(f"{w}/cpp{fase}.raw")
    d = max(abs(a-b) for a,b in zip(r,c)) if len(r)==len(c) else float("inf")
    ok &= d < 1e-6
    print(f"fase={fase}: muestras={len(r)} max|dif|={d:.3e} {'OK' if d < 1e-6 else 'FALLA'}")
sys.exit(0 if ok else 1)
PY
