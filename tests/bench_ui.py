import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
R=__import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
srv=subprocess.Popen([sys.executable,"-m","http.server","8778","-d",R+"/app"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
init="""
(() => {
  const oy = {}, llamadas = []; window.__llamadas = llamadas; window.__oy = oy;
  const gens=['Rock','Pop','Electrónica','Metal','Hip-Hop','Videojuegos','Banda sonora','Trance','Techno','Dance'];
  const lista = Array.from({length:2751},(_,k)=>{const i=k+1; return { id:'ms'+i, uri:'content://m/'+i, titulo:'Tema '+i+' '+(i%7?'Alpha':'Beta'), artista:'Artista '+(i%180), albumArtista:'Artista '+(i%180), album:'Disco '+(i%300), albumId:''+(i%300), genero:gens[i%10], pista:i%12, disco:1, anio:2000+(i%25), duracion:150+(i%200), tam:9e6, fecha:i, mime:'audio/mpeg', nombre:'t'+i+'.mp3', carpeta:'Music/C'+(i%40)+'/', bitrate:192, sampleRate:44100 };});
  const reg = (n) => async (a) => { llamadas.push([n, a]); return {}; };
  const M = new Proxy({
    addListener: (n, f) => { oy[n] = f; return Promise.resolve({ remove() {} }); },
    texto: async () => ({ codigo: 200, cuerpo: '{}' }),
    permisos: async () => ({ audio: true }), escanear: async () => ({ canciones: lista }), portada: async () => ({}),
    estado: async () => ({ ids: [], indice: -1, pos: 0, sonando: false }),
  }, { get: (t, k) => (k in t ? t[k] : reg(k)) });
  window.Capacitor = { isNativePlatform: () => true, convertFileSrc: (p) => p, Plugins: { Motor: M } };
  window.__lt=[]; try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__lt.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({entryTypes:['longtask']}); }catch(e){}
})();"""
rate=float(sys.argv[1]) if len(sys.argv)>1 else 4
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},service_workers="block"); ctx.add_init_script(init); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    cdp=ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate",{"rate":rate})
    t0=time.time(); pg.goto("http://localhost:8778/"); pg.wait_for_function("window.__onda && window.__onda.E.canciones.length>=2700",timeout=60000); pg.wait_for_timeout(6500)
    print("carga inicial s:",round(time.time()-t0,1))
    def paso(nombre, f, esperar=".tile, .fila, .generos, .tarjeta"):
        pg.evaluate("window.__lt.length=0"); t=pg.evaluate("performance.now()"); f(); 
        pg.wait_for_timeout(1500)
        lt=pg.evaluate("window.__lt"); tot=sum(d for _,d in lt); mx=max([d for _,d in lt] or [0])
        print(f"{nombre:34s} tareas largas: {len(lt):2d}  total {tot:5d} ms  máx {mx:4d} ms")
    paso("Inicio -> Buscar", lambda: pg.click("#nav [data-v=buscar]"))
    paso("Buscar -> Biblioteca", lambda: pg.click("#nav [data-v=biblioteca]"))
    paso("Biblioteca -> Inicio", lambda: pg.click("#nav [data-v=inicio]"))
    paso("Inicio -> Biblioteca", lambda: pg.click("#nav [data-v=biblioteca]"))
    paso("pestaña Álbumes", lambda: pg.click("[data-t=albumes]"))
    paso("pestaña Artistas", lambda: pg.click("[data-t=artistas]"))
    paso("pestaña Canciones", lambda: pg.click("[data-t=canciones]"))
    paso("escribir en el buscador", lambda: pg.type("#q","alpha 12",delay=60))
    pg.fill("#q",""); pg.evaluate("document.querySelector('#q').dispatchEvent(new Event('input'))"); pg.wait_for_timeout(800)
    paso("tocar canción + abrir reproductor", lambda: (pg.click("#contenido .fila >> nth=2"), pg.wait_for_timeout(300), pg.click("#mini-abrir")))
    paso("abrir ecualizador", lambda: pg.click("#r-eq"))
    pg.evaluate("document.querySelector('#hoja-eq [data-cerrar]').click()"); pg.wait_for_timeout(600)
    paso("abrir letra", lambda: pg.click("#r-letra"))
    pg.evaluate("document.querySelector('#hoja-letra [data-cerrar]').click()"); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#hoja-rep [data-cerrar]').click()"); pg.wait_for_timeout(600)
    paso("abrir ajustes", lambda: pg.click("#b-ajustes"))
    print("errores:",errs)
finally: srv.terminate()
