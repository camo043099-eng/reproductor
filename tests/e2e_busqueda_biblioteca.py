# Biblioteca > Canciones: al buscar no se deben crear miles de filas de golpe (eso congelaba la pantalla unos 3 s).
# Se dibujan las primeras 50 y el resto llega al acercarse al final con el scroll. Uso: python3 tests/e2e_busqueda_biblioteca.py [canciones] [ralentizacion_cpu]
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2751
CPU = float(sys.argv[2]) if len(sys.argv) > 2 else 4
R = os.path.dirname(os.path.abspath(__file__)); APP = os.environ.get("ONDA_APP") or os.path.join(R, "..", "app")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "-d", APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
INIT = """
(() => {
  const oy = {};
  const lista = Array.from({length:%d},(_,k)=>{const i=k+1; return { id:'ms'+i, uri:'content://m/'+i, titulo:'Tema '+i+' '+(i%%7?'Alpha':'Beta'), artista:'Artista '+(i%%180), albumArtista:'Artista '+(i%%180), album:'Disco '+(i%%300), albumId:''+(i%%300), genero:'Rock', pista:i%%12, disco:1, anio:2000+(i%%25), duracion:150+(i%%200), tam:9e6, fecha:i, mime:'audio/mpeg', nombre:'t'+i+'.mp3', carpeta:'Music/C'+(i%%40)+'/', bitrate:192, sampleRate:44100 };});
  const M = new Proxy({
    addListener: (n, f) => { oy[n] = f; return Promise.resolve({ remove() {} }); },
    texto: async () => ({ codigo: 200, cuerpo: '{}' }), permisos: async () => ({ audio: true }), escanear: async () => ({ canciones: lista }), portada: async () => ({}),
    estado: async () => ({ ids: [], indice: -1, pos: 0, sonando: false }),
  }, { get: (t, k) => (k in t ? t[k] : async () => ({})) });
  window.Capacitor = { isNativePlatform: () => true, convertFileSrc: (p) => p, Plugins: { Motor: M } };
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();""" % N
errs = []
try:
    with sync_playwright() as p:
        try: b = p.chromium.launch()
        except Exception: b = p.chromium.launch(channel="msedge")          # sin el Chromium de Playwright instalado, usa Edge
        ctx = b.new_context(viewport={"width": 390, "height": 800}, service_workers="block"); ctx.add_init_script(INIT); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://localhost:8766/"); pg.wait_for_function(f"window.__onda && window.__onda.E.canciones.length>={N-50}", timeout=120000); pg.wait_for_timeout(6500)
        pg.click("#nav [data-v=biblioteca]"); pg.wait_for_timeout(300); pg.click(".cat[data-t=canciones]"); pg.wait_for_selector("#contenido .fila"); pg.wait_for_timeout(4000)
        cdp = ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate", {"rate": CPU})
        filas = lambda: pg.locator("#contenido .fila").count()

        pg.evaluate("window.__lt.length = 0"); pg.click("#q"); pg.keyboard.type("a"); pg.wait_for_timeout(1500)
        n1 = filas(); bloqueo = int(pg.evaluate("window.__lt.reduce((a, d) => a + d, 0)"))
        print(f"tras escribir «a»: {n1} filas dibujadas de {N} coincidencias · tiempo bloqueado (tareas largas): {bloqueo} ms")
        assert n1 <= 100, f"no debe dibujar todas las filas de golpe (hay {n1})"
        assert bloqueo < 600, f"la pantalla se bloqueó {bloqueo} ms al buscar"

        pg.mouse.move(200, 400); pg.mouse.wheel(0, 3000); pg.wait_for_timeout(1200); n2 = filas()
        print(f"tras bajar con el scroll: {n2} filas")
        assert n2 > n1, "al acercarse al final deben llegar más filas"

        pg.fill("#q", "alpha 12"); pg.wait_for_timeout(1500)
        esperadas = pg.evaluate("window.__onda.E.canciones.filter(s => /alpha/i.test(s.titulo) && s.titulo.includes('12')).length")
        assert 0 < filas() <= 100 and filas() <= esperadas, f"«alpha 12» ({esperadas} coincidencias) debe mostrar solo la primera tanda (hay {filas()})"
        pg.click("#contenido .fila >> nth=0"); pg.wait_for_selector("#mini:not([hidden])", timeout=8000)    # tocar un resultado sigue funcionando
        print("tocar un resultado OK")

        # Tocar «Canciones» y enseguida la barra de búsqueda: mientras la lista completa se sigue pintando de fondo, el teclado y la escritura se trababan.
        # Con la barra tocada el pintado de fondo se detiene, y al soltarla se retoma hasta completar la lista.
        pg2 = ctx.new_page(); cdp2 = ctx.new_cdp_session(pg2)
        pg2.goto("http://localhost:8766/"); pg2.wait_for_function(f"window.__onda && window.__onda.E.canciones.length>={N-50}", timeout=120000); pg2.wait_for_timeout(6500)
        cdp2.send("Emulation.setCPUThrottlingRate", {"rate": CPU})
        pg2.click("#nav [data-v=biblioteca]"); pg2.wait_for_timeout(300); pg2.click(".cat[data-t=canciones]"); pg2.wait_for_selector("#contenido .fila")
        pg2.evaluate("document.querySelector('#q').focus()"); pg2.wait_for_timeout(300)
        a = pg2.locator("#contenido .fila").count(); pg2.wait_for_timeout(2500); c = pg2.locator("#contenido .fila").count()
        print(f"con la barra tocada: {a} filas a los 0,3 s y {c} a los 2,8 s (el pintado de fondo debe estar detenido)")
        assert c - a <= 130, f"el pintado de fondo siguió con la barra tocada ({a} -> {c} filas)"
        pg2.evaluate("document.querySelector('#q').blur()")
        pg2.wait_for_function(f"document.querySelectorAll('#contenido .fila').length >= {N}", timeout=90000)
        print(f"al soltar la barra se completó la lista: {N} filas")
        b.close()
finally:
    srv.terminate()
errs = [e for e in errs if "favicon" not in e]
print("ERRORES:", errs) if errs else print("E2E búsqueda en Biblioteca OK")
sys.exit(1 if errs else 0)
