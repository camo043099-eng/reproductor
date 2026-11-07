#!/usr/bin/env python3
"""Símbolo de Onda v2: líneas finas que se mezclan entre dos curvas (efecto cinta) dentro de un anillo.
Diseño original y generativo. Salida: SVG estáticos y animado."""
import math, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "logo"
os.makedirs(OUT, exist_ok=True)

C = 512
RING_R = 372
RING_W = 14
N = 34            # número de líneas
M = 150           # puntos por línea
ANCHO = 300       # semiancho de la cinta
ALTO = 215        # amplitud máxima
PERIODO = 3.6     # segundos del bucle de animación


def env(x):
    return max(0.0, math.cos(math.pi * x / 2)) ** 1.25


def f(x):
    return ALTO * env(x) * math.sin(2 * math.pi * 1.25 * x + 0.35)


def g(x):
    return ALTO * 0.95 * env(x) * math.sin(2 * math.pi * 1.1 * x + 1.9)


def suave(t):
    return t * t * (3 - 2 * t)


def lineas():
    res = []
    for i in range(N):
        t = i / (N - 1)
        w = suave(t)
        pts = []
        for k in range(M):
            x = -1 + 2 * k / (M - 1)
            y = (1 - w) * f(x) + w * g(x) + (t - 0.5) * 150 * env(x) ** 0.6
            pts.append((C + ANCHO * x, C - y))
        d = "M" + " L".join(f"{px:.1f} {py:.1f}" for px, py in pts)
        res.append(d)
    return res


DEG = f"""<linearGradient id="deg" gradientUnits="userSpaceOnUse" x1="{C-ANCHO}" y1="0" x2="{C+ANCHO}" y2="0">
      <stop offset="0" stop-color="#ff5fa8"/><stop offset=".36" stop-color="#9a5cf6"/><stop offset=".7" stop-color="#3fa2f6"/><stop offset="1" stop-color="#34e3d2"/>
    </linearGradient>
    <linearGradient id="anillo" gradientUnits="userSpaceOnUse" x1="140" y1="200" x2="884" y2="840">
      <stop offset="0" stop-color="#ff5fa8"/><stop offset=".5" stop-color="#8a5cf6"/><stop offset="1" stop-color="#34c8e8"/>
    </linearGradient>"""

CSS = f"""<style>
    .l{{transform-box:fill-box;transform-origin:50% 50%}}
    .brillo{{transform-origin:0 0}}
    @media (prefers-reduced-motion:no-preference){{
      .anim .l{{animation:resp {PERIODO}s ease-in-out infinite;animation-delay:calc(var(--i) * -{PERIODO/N:.4f}s)}}
      .anim .brillo{{animation:giro {PERIODO}s linear infinite}}
    }}
    @keyframes resp{{0%,100%{{transform:scaleY(.8)}}50%{{transform:scaleY(1.12)}}}}
    @keyframes giro{{to{{transform:rotate(360deg)}}}}
  </style>"""


def simbolo(modo="color", animado=False):
    """Fragmento SVG con anillo + cinta. modo: color | mono."""
    circ = 2 * math.pi * RING_R
    if modo == "mono":
        trazo, anillo, brillo = "#ffffff", "#ffffff", ""
        op = "1"
    else:
        trazo, anillo = "url(#deg)", "url(#anillo)"
        brillo = (f'<g transform="translate({C} {C})"><circle class="brillo" cx="0" cy="0" r="{RING_R}" fill="none" stroke="#ffffff" stroke-opacity=".9" '
                  f'stroke-width="{RING_W}" stroke-linecap="round" stroke-dasharray="{circ*0.09:.1f} {circ:.1f}"/></g>') if animado else ""
        op = ".95"
    s = f'<g class="{"anim" if animado else ""}">'
    s += f'<circle cx="{C}" cy="{C}" r="{RING_R}" fill="none" stroke="{anillo}" stroke-width="{RING_W}"/>'
    s += brillo
    ancho = 2.6 if modo == "color" else 4
    for i, d in enumerate(lineas()):
        s += f'<path class="l" style="--i:{i}" d="{d}" fill="none" stroke="{trazo}" stroke-opacity="{op}" stroke-width="{ancho}" stroke-linecap="round" stroke-linejoin="round"/>'
    return s + "</g>"


def svg(cuerpo, defs=True, css=False):
    d = f"<defs>{DEG}</defs>" if defs else ""
    c = CSS if css else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{c}{d}{cuerpo}</svg>'


FONDO = ('<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262c3a"/><stop offset="1" stop-color="#0e1118"/></linearGradient>'
         '<radialGradient id="glow" cx=".5" cy=".45" r=".62"><stop offset="0" stop-color="#8a5cf6" stop-opacity=".30"/><stop offset="1" stop-color="#8a5cf6" stop-opacity="0"/></radialGradient></defs>')


def con_fondo(cuerpo, redondo=True, animado=False):
    r = ' rx="228"' if redondo else ""
    return svg(f'{FONDO}<rect width="1024" height="1024"{r} fill="url(#bg)"/><rect width="1024" height="1024"{r} fill="url(#glow)"/>{cuerpo}',
               css=animado)


def reducir(cuerpo, k=0.62):
    return f'<g transform="translate({C} {C}) scale({k}) translate({-C} {-C})">{cuerpo}</g>'


if __name__ == "__main__":
    archivos = {
        "onda-logo-animado.svg": svg(simbolo("color", True), css=True),                 # solo símbolo, animado, fondo transparente
        "onda-icono-animado.svg": con_fondo(simbolo("color", True), animado=True),       # con fondo, animado
        "onda-logo.svg": svg(simbolo("color", False)),                                  # solo símbolo, estático
        "onda-icono.svg": con_fondo(simbolo("color", False)),                           # icono completo estático
        "onda-icono-adaptable-fondo.svg": svg(f'{FONDO}<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>', defs=False),
        "onda-icono-adaptable-frente.svg": svg(reducir(simbolo("color", False))),
        "onda-icono-monocromo.svg": svg(reducir(simbolo("mono", False)), defs=False),
    }
    for nombre, contenido in archivos.items():
        open(os.path.join(OUT, nombre), "w", encoding="utf-8").write(contenido)
        print("ok", nombre, f"{len(contenido)//1024} KB")
