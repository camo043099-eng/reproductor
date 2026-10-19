import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.abspath(__file__)); APP = os.path.join(R, "..", "app"); FX = os.path.join(R, "fixtures")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); ctx = b.new_context(viewport={"width": 390, "height": 800}); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto("http://localhost:8765/"); pg.wait_for_selector(".vacio")
        pg.set_input_files("#f-audio", [f"{FX}/prueba.flac", f"{FX}/prueba.mp3", f"{FX}/sin_etiquetas.wav"])
        pg.wait_for_selector(".fila", timeout=15000); pg.wait_for_function("document.querySelectorAll('.fila').length==3", timeout=15000)
        print("filas:", pg.eval_on_selector_all(".fila b", "e=>e.map(x=>x.textContent)"))
        pg.click(".fila >> nth=0"); pg.wait_for_selector("#mini:not([hidden])")
        pg.wait_for_function("window.__onda.reproductor.tiempo>0.3", timeout=10000); print("suena, t=", pg.evaluate("window.__onda.reproductor.tiempo"))
        assert pg.evaluate("navigator.mediaSession.metadata && navigator.mediaSession.metadata.title"), "sin MediaSession"
        pg.click("#mini-abrir"); pg.wait_for_selector("#hoja-rep:not([hidden])"); print("chips:", pg.inner_text("#r-chips"))
        pg.click("#r-fav"); pg.wait_for_selector("#r-fav[aria-pressed=true]")
        pg.click("#r-eq"); pg.click("[data-preset=Bajos]"); assert pg.evaluate("window.__onda.reproductor.bandasDb[0]") == 6
        pg.click("#hoja-eq [data-cerrar]"); pg.click("#hoja-rep [data-cerrar]")
        pg.click("#mini-play"); pg.wait_for_function("!window.__onda.reproductor.sonando")
        pg.click("#mini-sig"); pg.wait_for_function("window.__onda.reproductor.pos==1", timeout=8000)
        pg.click("[data-t=albumes]"); assert pg.query_selector(".tarjeta"), "sin álbumes"
        pg.click("[data-t=listas]"); pg.click("[data-det=lista]"); assert "Favoritas" in pg.inner_text(".cabecera-detalle")
        pg.reload(); pg.wait_for_selector("#mini:not([hidden])", timeout=10000)
        pg.wait_for_function("window.__onda.E.canciones.length==3"); assert pg.evaluate("window.__onda.E.canciones.some(s=>s.fav)"), "favorita no persistió"
        print("persistencia OK:", pg.inner_text("#mini-titulo"))
        pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)"); ctx.set_offline(True); pg.reload(); pg.wait_for_selector(".fila", timeout=8000); print("offline OK")
        b.close()
finally:
    srv.terminate()
errs = [e for e in errs if "favicon" not in e]
print("ERRORES:", errs) if errs else print("E2E OK")
sys.exit(1 if errs else 0)
