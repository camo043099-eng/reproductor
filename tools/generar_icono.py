"""Genera los iconos de Onda (Android adaptativo, redondo, monocromo y PWA) a partir de un mismo dibujo.
Uso: python3 tools/generar_icono.py   (necesita playwright con chromium)"""
import os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BARRAS = [96, 176, 266, 196, 116]            # alto de cada barra en un lienzo de 512
def barras(relleno, ancho=34, sep=20, esc=1.0):
    total = len(BARRAS) * ancho + (len(BARRAS) - 1) * sep; x0 = 256 - total / 2; out = ""
    for i, h in enumerate(BARRAS):
        h *= esc; out += f'<rect x="{x0 + i * (ancho + sep):.1f}" y="{256 - h / 2:.1f}" width="{ancho}" height="{h:.1f}" rx="{ancho / 2}" fill="{relleno}"/>'
    return out
DEG = '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14092f"/><stop offset=".55" stop-color="#3b1d94"/><stop offset="1" stop-color="#c0327f"/></linearGradient>'
BAR = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffa6d6"/></linearGradient>'
def svg(cuerpo, defs=""): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{defs}</defs>{cuerpo}</svg>'
FRENTE = svg(barras("url(#g)"), BAR)                                                  # capa de adelante (transparente)
FONDO = svg('<rect width="512" height="512" fill="url(#b)"/><circle cx="256" cy="256" r="150" fill="#fff" opacity=".05"/>', DEG)
MONO = svg(barras("#ffffff"))
LEGADO = svg('<rect width="512" height="512" rx="112" fill="url(#b)"/><circle cx="256" cy="256" r="150" fill="#fff" opacity=".05"/>' + barras("url(#g)", 38, 22, 1.12), DEG + BAR)
REDONDO = svg('<circle cx="256" cy="256" r="256" fill="url(#b)"/><circle cx="256" cy="256" r="150" fill="#fff" opacity=".05"/>' + barras("url(#g)", 36, 21, 1.02), DEG + BAR)
PWA = svg('<rect width="512" height="512" fill="url(#b)"/>' + barras("url(#g)", 34, 20, 1.15), DEG + BAR)
DENS = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    def png(s, lado, ruta):
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        pg.set_viewport_size({"width": lado, "height": lado})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{s.replace("width=\"512\" height=\"512\"", f"width=\"{lado}\" height=\"{lado}\"", 1)}</body></html>')
        pg.screenshot(path=ruta, omit_background=True, clip={"x": 0, "y": 0, "width": lado, "height": lado})
    for d, (leg, ada) in DENS.items():
        base = f"{R}/native/icono/res/mipmap-{d}"
        png(LEGADO, leg, f"{base}/ic_launcher.png"); png(REDONDO, leg, f"{base}/ic_launcher_round.png")
        png(FRENTE, ada, f"{base}/ic_onda_frente.png"); png(FONDO, ada, f"{base}/ic_onda_fondo.png"); png(MONO, ada, f"{base}/ic_onda_mono.png")
    png(PWA, 192, f"{R}/app/icons/icon-192.png"); png(PWA, 512, f"{R}/app/icons/icon-512.png")
    open(f"{R}/app/icons/icon.svg", "w").write(PWA)
    b.close()
print("iconos listos")
