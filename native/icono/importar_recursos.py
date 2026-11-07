"""Icono de Onda a partir de docs/recursos/iconos (lo entregado por diseño).

Genera en native/icono/res (los copia parchear.py al proyecto Android):
  - capas adaptables ic_onda_fondo / ic_onda_frente / ic_onda_mono en 108·162·216·324·432 px (mdpi…xxxhdpi)
  - ic_launcher.png (cuadrado, para Android < 8) con los PNG por densidad ya hechos, y ic_launcher_round.png (recorte circular)
y los iconos de la PWA en app/icons. Los iconos de temporada (temporadas.py) no se tocan.
Uso: python native/icono/importar_recursos.py   (necesita Pillow)
"""
import os, shutil
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGEN = os.path.join(RAIZ, "docs", "recursos", "iconos")
RES = os.path.join(RAIZ, "native", "icono", "res")
CAPA = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LEGADO = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

def abrir(n): return Image.open(os.path.join(ORIGEN, n)).convert("RGBA")

def redondo(im):
    m = Image.new("L", (im.width * 4, im.height * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    out = im.copy(); out.putalpha(Image.composite(im.split()[3], Image.new("L", im.size, 0), m.resize(im.size, Image.LANCZOS)))
    return out

fondo, frente, mono = abrir("onda-icono-adaptable-fondo.png"), abrir("onda-icono-adaptable-frente.png"), abrir("onda-icono-monocromo.png")
for d, lado in CAPA.items():
    carpeta = os.path.join(RES, f"mipmap-{d}"); os.makedirs(carpeta, exist_ok=True)
    for nombre, im in (("fondo", fondo), ("frente", frente), ("mono", mono)):
        im.resize((lado, lado), Image.LANCZOS).save(os.path.join(carpeta, f"ic_onda_{nombre}.png"), optimize=True)
    leg = abrir(f"onda-icono-{d}-{LEGADO[d]}.png")
    leg.save(os.path.join(carpeta, "ic_launcher.png"), optimize=True); redondo(leg).save(os.path.join(carpeta, "ic_launcher_round.png"), optimize=True)

# PWA: capa de fondo + frente a pantalla completa (sirve como «maskable»), el logo y el SVG
pwa = fondo.copy(); pwa.alpha_composite(frente)
for lado in (192, 512): pwa.resize((lado, lado), Image.LANCZOS).convert("RGB").save(os.path.join(RAIZ, "app", "icons", f"icon-{lado}.png"), optimize=True)
abrir("onda-icono.png").resize((512, 512), Image.LANCZOS).save(os.path.join(RAIZ, "app", "icons", "icono-onda.png"), optimize=True)
shutil.copyfile(os.path.join(ORIGEN, "onda-icono.svg"), os.path.join(RAIZ, "app", "icons", "icon.svg"))
print("iconos importados")
