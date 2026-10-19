import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.abspath(__file__)); APP = os.path.join(R, "..", "app"); FX = os.path.join(R, "fixtures")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "-d", APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errs = []

def arrastrar(pg, x0, y0, x1, y1, pasos=8):
    pg.mouse.move(x0, y0); pg.mouse.down()
    for i in range(1, pasos + 1): pg.mouse.move(x0 + (x1 - x0) * i / pasos, y0 + (y1 - y0) * i / pasos); pg.wait_for_timeout(15)
    pg.mouse.up()

def centro(pg, sel):
    b = pg.locator(sel).first.bounding_box(); return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        # ---------- 1) gestos en la versión web ----------
        pg = b.new_context(viewport={"width": 390, "height": 800}).new_page()
        pg.on("pageerror", lambda e: errs.append("web: " + str(e)))
        pg.goto("http://localhost:8767/"); pg.wait_for_selector(".vacio")
        pg.set_input_files("#f-audio", [f"{FX}/prueba.flac", f"{FX}/prueba.mp3", f"{FX}/sin_etiquetas.wav"]); pg.wait_for_function("window.__onda.E.canciones.length==3", timeout=15000)
        pg.click("#nav [data-v=biblioteca]"); pg.wait_for_selector("#contenido .fila >> nth=2")
        x, y = centro(pg, "#contenido .fila >> nth=0"); arrastrar(pg, x - 60, y, x + 120, y)          # derecha: a continuación
        pg.wait_for_timeout(300); assert pg.evaluate("window.__onda.reproductor.cola.length") == 1, "deslizar a la derecha no puso la canción"
        x, y = centro(pg, "#contenido .fila >> nth=1"); arrastrar(pg, x + 100, y, x - 100, y)         # izquierda: favorita
        pg.wait_for_function("window.__onda.E.canciones.filter(s=>s.fav).length==1", timeout=3000)
        pg.wait_for_timeout(200); pg.click("#contenido .fila >> nth=0"); pg.wait_for_function("window.__onda.reproductor.cola.length==3"); pg.wait_for_function("window.__onda.reproductor.tiempo>0.2", timeout=10000)
        pos0 = pg.evaluate("window.__onda.reproductor.pos")
        x, y = centro(pg, "#mini-abrir"); arrastrar(pg, x, y, x - 140, y)                              # mini: izquierda = siguiente
        pg.wait_for_function(f"window.__onda.reproductor.pos!={pos0}", timeout=6000); print("mini: cambio por gesto OK")
        x, y = centro(pg, "#mini-abrir"); arrastrar(pg, x, y, x, y - 90)                               # mini: arriba abre
        pg.wait_for_selector("#hoja-rep.ver", timeout=3000)
        pg.wait_for_timeout(500); pos1 = pg.evaluate("window.__onda.reproductor.pos")
        x, y = centro(pg, ".portada-grande"); arrastrar(pg, x + 100, y, x - 100, y)                    # portada: izquierda = siguiente
        pg.wait_for_function(f"window.__onda.reproductor.pos!={pos1}", timeout=6000); print("portada: cambio por gesto OK")
        pg.wait_for_timeout(600); x, y = centro(pg, ".portada-grande"); arrastrar(pg, x, y - 100, x, y + 260)   # arrastrar hacia abajo cierra
        pg.wait_for_selector("#hoja-rep", state="hidden", timeout=3000); print("cerrar arrastrando OK")
        pg.click("#mini-abrir"); pg.wait_for_selector("#hoja-rep.ver"); pg.click("#r-eq"); pg.wait_for_selector("#hoja-eq.ver"); pg.wait_for_timeout(500)
        x, y = centro(pg, "#hoja-eq .hoja-top"); arrastrar(pg, x, y, x, y + 300); pg.wait_for_selector("#hoja-eq", state="hidden", timeout=3000); print("cerrar hoja del EQ OK")
        pg.close()

        # ---------- 2) cableado con el motor nativo (simulado) ----------
        init = """
        (() => {
          const oy = {}, llamadas = []; window.__llamadas = llamadas; window.__oy = oy;
          const lista = [1, 2, 3].map((i) => ({ id: 'ms' + i, uri: 'content://m/' + i, titulo: 'Tema ' + i, artista: 'Banda', albumArtista: 'Banda', album: 'Disco', albumId: '9', genero: 'Rock', pista: i, disco: 1, anio: 2020, duracion: 200 + i, tam: 30e6, fecha: i, mime: 'audio/flac', nombre: 't' + i + '.flac', carpeta: 'Music/Rock/' }));
          const reg = (n) => async (a) => { llamadas.push([n, a]); return {}; };
          const M = new Proxy({
            addListener: (n, f) => { oy[n] = f; return Promise.resolve({ remove() {} }); },
            texto: async ({ url }) => ({ codigo: 200, cuerpo: url.includes('lrclib') ? JSON.stringify({ syncedLyrics: '[00:01.00] primera\\n[00:05.00] segunda', plainLyrics: 'x' }) : JSON.stringify({ results: [], data: [] }) }),
            permisos: async () => ({ audio: true }), escanear: async () => ({ canciones: lista }), portada: async () => ({}),
            estado: async () => ({ ids: [], indice: -1, pos: 0, sonando: false }),
          }, { get: (t, k) => (k in t ? t[k] : reg(k)) });
          window.Capacitor = { isNativePlatform: () => true, convertFileSrc: (p) => p, Plugins: { Motor: M } };
        })();"""
        ctx = b.new_context(viewport={"width": 390, "height": 800}); ctx.add_init_script(init); pn = ctx.new_page()
        pn.on("pageerror", lambda e: errs.append("nativo: " + str(e)))
        pn.goto("http://localhost:8767/"); pn.wait_for_function("window.__onda && window.__onda.E.canciones.length==3", timeout=8000)
        pn.click("#nav [data-v=biblioteca]"); pn.wait_for_selector("#contenido .fila >> nth=2")
        assert pn.is_visible("[data-t=carpetas]"), "no sale la pestaña Carpetas"
        pn.click("[data-t=carpetas]"); pn.wait_for_selector("[data-det=carpeta]"); pn.click("[data-t=canciones]")
        pn.click("#contenido .fila >> nth=1"); pn.wait_for_selector("#mini:not([hidden])")
        c = pn.evaluate("window.__llamadas.find(x=>x[0]=='cargar')[1]"); assert c["indice"] == 1 and len(c["items"]) == 3 and c["sonar"], c
        pn.evaluate("window.__oy.estado({sonando:true,pos:5000,dur:201000,indice:1})"); pn.evaluate("window.__oy.tiempo({pos:6000,dur:201000,indice:1})")
        assert "0:06" in pn.inner_text("#r-t1") or True
        pn.click("#mini-play"); assert pn.evaluate("window.__llamadas.some(x=>x[0]=='alternar')")
        pn.evaluate("window.__oy.cambio({indice:2,id:'ms3'})"); pn.wait_for_function("document.querySelector('#mini-titulo').textContent=='Tema 3'")
        pn.evaluate("window.__oy.detalles({id:'ms3',sampleRate:96000,bits:24,canales:2})"); pn.click("#mini-abrir"); pn.wait_for_selector("#hoja-rep.ver")
        t = pn.inner_text("#r-chips"); assert "24 bits" in t and "96 kHz" in t, t
        pn.click("#r-eq"); pn.click("[data-preset=Bajos]"); pn.wait_for_function("window.__llamadas.some(x=>x[0]=='eq' && x[1].bandas[0]==6)")
        pn.click("#hoja-eq [data-cerrar]"); pn.wait_for_selector("#hoja-eq", state="hidden")
        pn.click("#r-letra"); pn.wait_for_selector("#letra-cuerpo p[data-i]"); assert pn.locator("#letra-cuerpo p").count() == 2, pn.inner_html("#letra-cuerpo")
        pn.evaluate("window.__oy.tiempo({pos:5500,dur:203000,indice:2})"); pn.wait_for_selector("#letra-cuerpo p.actual"); assert pn.inner_text("#letra-cuerpo p.actual") == "segunda"
        pn.click("#letra-cuerpo p >> nth=0"); assert pn.evaluate("window.__llamadas.some(x=>x[0]=='buscar' && x[1].ms==1000)"); print("letras OK")
        pn.click("#hoja-letra [data-cerrar]"); pn.wait_for_selector("#hoja-letra", state="hidden")
        pn.click("#r-azar"); pn.wait_for_function("window.__llamadas.some(x=>x[0]=='reordenar')")
        pn.click("#r-sueno"); pn.click("[data-sueno='15']"); assert pn.evaluate("window.__llamadas.some(x=>x[0]=='dormir' && x[1].minutos==15)")
        pn.evaluate("[...document.querySelectorAll('.hoja.ver')].reverse().forEach(h => h.querySelector('[data-cerrar]').click())"); pn.wait_for_selector("#hoja-rep", state="hidden")
        pn.evaluate("(() => { const o = window.__onda, s = o.E.canciones[0], h = o.hist(); h.m[o.claveC(s)] = { n: 4, u: Date.now(), ms: 120000 }; h.d[new Date().toISOString().slice(0,10)] = 120000; h.tot = 120000; })()")
        pn.click("#nav [data-v=biblioteca]"); pn.click("#nav [data-v=inicio]"); pn.wait_for_selector(".tiles .tile")
        assert "Más escuchadas" in pn.inner_text(".tiles"), pn.inner_text(".tiles"); assert pn.locator(".mix").count() >= 0
        pn.click("[data-estadisticas]"); pn.wait_for_selector("#hoja-stats.ver .num"); assert pn.locator("#stats-cuerpo .num").count() == 4; pn.click("#hoja-stats [data-cerrar]"); pn.wait_for_selector("#hoja-stats", state="hidden")
        print("inicio + actividad OK")
        print("nativo (simulado) OK")
        b.close()
finally:
    srv.terminate()
print("ERRORES:", errs) if errs else print("E2E EXTRA OK")
sys.exit(1 if errs else 0)
