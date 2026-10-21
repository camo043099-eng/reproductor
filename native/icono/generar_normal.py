"""Icono normal de Onda: solo el anillo (native/icono/anillo.png) sobre fondo transparente.

Genera las capas adaptativas (fondo, frente y monocromo) y el icono cuadrado para
versiones anteriores, en todas las densidades. Se ejecuta una vez.
"""
import os
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(AQUI, "res")
FONDO = (0, 0, 0, 0)                                         # sin fondo: solo el anillo (transparente)
TAM = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LEGADO = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

anillo = Image.open(os.path.join(AQUI, "anillo.png")).convert("RGBA")

def capa_frente():
    # el anillo ocupa ~62 % del lienzo: dentro de la zona segura (círculo de 66 %)
    lienzo = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    k = 270 / max(anillo.size)
    r = anillo.resize((round(anillo.width * k), round(anillo.height * k)), Image.LANCZOS)
    lienzo.alpha_composite(r, ((432 - r.width) // 2, (432 - r.height) // 2))
    return lienzo

def capa_fondo():
    return Image.new("RGBA", (432, 432), FONDO)                # transparente

def capa_mono(frente):
    # silueta blanca: Android 13+ la tiñe con el color del tema
    mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    blanco = Image.new("RGBA", (432, 432), (255, 255, 255, 255))
    mono.paste(blanco, (0, 0), frente.getchannel("A"))
    return mono

def icono_legado(fondo, frente):
    # sin cuadro: el anillo sobre transparente
    out = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    out.alpha_composite(frente)
    return out

def guardar(im, carpeta, nombre, tam):
    os.makedirs(carpeta, exist_ok=True)
    im.resize((tam, tam), Image.LANCZOS).save(os.path.join(carpeta, nombre + ".png"), optimize=True)

frente = capa_frente(); fondo = capa_fondo(); mono = capa_mono(frente); legado = icono_legado(fondo, frente)
for dens in TAM:
    carp = os.path.join(RES, "mipmap-" + dens)
    guardar(fondo, carp, "ic_onda_fondo", TAM[dens])
    guardar(frente, carp, "ic_onda_frente", TAM[dens])
    guardar(mono, carp, "ic_onda_mono", TAM[dens])
    guardar(legado, carp, "ic_launcher", LEGADO[dens])
    guardar(legado, carp, "ic_launcher_round", LEGADO[dens])
print("icono normal generado")
