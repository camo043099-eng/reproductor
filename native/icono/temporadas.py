"""Genera los iconos de temporada de Onda a partir del icono actual.

Para cada temporada hace: fondo (degradado), frente (barras + detalle, zona segura),
mono (silueta para Android 13+) y un icono cuadrado para versiones anteriores.
Se ejecuta una vez; los PNG resultantes se guardan en native/icono/res.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res")
TAM = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}     # capas adaptativas (dp*2.25)
LEGADO = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}    # icono cuadrado (dp)

def degradado(alto, arriba, abajo):
    im = Image.new("RGB", (432, 432))
    d = ImageDraw.Draw(im)
    for y in range(432):
        t = y / 431
        c = tuple(round(arriba[i] + (abajo[i] - arriba[i]) * t) for i in range(3))
        d.line([(0, y), (431, y)], fill=c)
    return im

def barras(d, color):
    # mismas proporciones que el icono actual
    for x0, y0, y1 in [(110, 178, 256), (156, 146, 290), (202, 110, 328), (248, 140, 298), (293, 170, 266)]:
        d.rounded_rectangle([x0, y0, x0 + 30, y1], radius=15, fill=color)

def calabaza(d, cx, cy, r, color, tallo):
    d.ellipse([cx - r, cy - r * 0.82, cx + r, cy + r * 0.82], fill=color)
    d.ellipse([cx - r * 0.45, cy - r * 0.82, cx + r * 0.45, cy + r * 0.82], fill=color)
    d.rounded_rectangle([cx - 5, cy - r * 1.05, cx + 5, cy - r * 0.7], radius=4, fill=tallo)

def estrella(d, cx, cy, r, color):
    import math
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=color)

def sol(d, cx, cy, r, color):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

TEMPORADAS = {
    "halloween": {
        "fondo": ((43, 15, 63), (150, 52, 12)),
        "barra": (255, 184, 77, 255), "detalle": (255, 138, 30, 255), "tallo": (74, 110, 40, 255),
        "dibujar": lambda d, col, tal: calabaza(d, 146, 304, 38, col, tal),
    },
    "navidad": {
        "fondo": ((11, 61, 36), (122, 15, 28)),
        "barra": (255, 255, 255, 255), "detalle": (255, 214, 77, 255), "tallo": None,
        "dibujar": lambda d, col, tal: estrella(d, 292, 128, 22, col),
    },
    "verano": {
        "fondo": ((255, 170, 60), (255, 61, 127)),
        "barra": (255, 255, 255, 255), "detalle": (255, 226, 92, 255), "tallo": None,
        "dibujar": lambda d, col, tal: sol(d, 292, 128, 26, col),
    },
}

def capa_frente(t):
    im = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    TEMPORADAS[t]["dibujar"](d, TEMPORADAS[t]["detalle"], TEMPORADAS[t]["tallo"])
    barras(d, TEMPORADAS[t]["barra"])
    return im

def capa_mono(t):
    im = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    blanco = (255, 255, 255, 255)
    TEMPORADAS[t]["dibujar"](d, blanco, blanco)
    barras(d, blanco)
    return im

def icono_legado(fondo, frente):
    base = fondo.convert("RGBA")
    base.alpha_composite(frente)
    mascara = Image.new("L", (432, 432), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, 431, 431], radius=96, fill=255)
    out = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    out.paste(base, (0, 0), mascara)
    return out

def guardar(im, carpeta, nombre, tam):
    os.makedirs(carpeta, exist_ok=True)
    im.resize((tam, tam), Image.LANCZOS).save(os.path.join(carpeta, nombre + ".png"), optimize=True)

for t, c in TEMPORADAS.items():
    fondo = degradado(432, *c["fondo"])
    frente = capa_frente(t)
    mono = capa_mono(t)
    legado = icono_legado(fondo, frente)
    for dens in TAM:
        carp = os.path.join(RES, "mipmap-" + dens)
        guardar(fondo, carp, "ic_onda_%s_fondo" % t, TAM[dens])
        guardar(frente, carp, "ic_onda_%s_frente" % t, TAM[dens])
        guardar(mono, carp, "ic_onda_%s_mono" % t, TAM[dens])
        guardar(legado, carp, "ic_onda_%s" % t, LEGADO[dens])
    print("temporada lista:", t)
