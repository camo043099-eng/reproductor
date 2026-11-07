# Inicio rediseñado: buscador arriba que lleva a Buscar, carrusel de carátulas, recomendados y listas inteligentes. Uso: python3 tests/e2e_inicio.py
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright

R = os.path.dirname(os.path.abspath(__file__)); APP = os.environ.get("ONDA_APP") or os.path.join(R, "..", "app")
src = open(os.path.join(R, "e2e_busqueda_biblioteca.py"), encoding="utf-8").read()
INIT = src[src.index('INIT = """') + 10: src.index('""" % N')] % 400          # misma biblioteca simulada que la prueba de búsqueda
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "-d", APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errs = []
try:
    with sync_playwright() as p:
        try: b = p.chromium.launch()
        except Exception: b = p.chromium.launch(channel="msedge")
        for nombre, vw in (("móvil", {"width": 390, "height": 800}), ("escritorio", {"width": 1280, "height": 800})):
            ctx = b.new_context(viewport=vw, service_workers="block"); ctx.add_init_script(INIT); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto("http://localhost:8767/"); pg.wait_for_function("window.__onda && window.__onda.E.canciones.length>=395", timeout=60000); pg.wait_for_selector(".buscar-falso", timeout=20000)
            assert pg.locator(".estante.hero .tarjeta.grande").count() >= 3, "falta el carrusel de carátulas"
            assert pg.locator(".lista-rec .tarjeta.rec").count() == 6, "faltan los 6 recomendados"
            assert pg.locator(".autos .auto").count() >= 1, "faltan las listas inteligentes"
            bbox = pg.locator(".buscar-falso").bounding_box(); assert bbox["height"] >= 44, "el buscador debe medir al menos 44 px"
            pg.click(".lista-rec .tarjeta.rec >> nth=0"); pg.wait_for_selector("#mini:not([hidden])", timeout=8000)          # tocar un recomendado reproduce
            pg.click(".auto >> nth=0"); pg.wait_for_selector("#contenido .fila", timeout=8000); pg.click("#nav [data-v=inicio]"); pg.wait_for_selector(".buscar-falso")      # una lista inteligente abre su detalle y se vuelve
            pg.click(".buscar-falso"); pg.wait_for_function("document.activeElement && document.activeElement.id === 'q'", timeout=4000)        # el buscador abre Buscar con el cursor listo
            assert pg.evaluate("document.querySelector('#nav [data-v=buscar]').getAttribute('aria-current') === 'page'"), "no abrió la pantalla Buscar"
            print(f"Inicio OK ({nombre})"); ctx.close()
        b.close()
finally:
    srv.terminate()
print("ERRORES:", errs) if errs else print("E2E Inicio OK")
sys.exit(1 if errs else 0)
