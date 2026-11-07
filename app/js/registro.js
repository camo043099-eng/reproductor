// Registro local de errores. Dentro de la app Android se guarda en un archivo privado (errores.log, lo escribe el motor nativo);
// en el navegador, en localStorage. Nunca se envía a ninguna parte.

const CLAVE = "onda-errores", MAX_LOCAL = 60000, REPETIDO_MS = 5000;

/** quita lo que podría identificar a la persona: direcciones y rutas de archivos, enlaces y correos */
export function limpiar(t) {
  t = String(t ?? "")
    .replace(/\b(?:content|file|https?):\/\/\S+/gi, "<uri>")
    .replace(/(?<![\w])\/(?:storage|sdcard|data|mnt)\/\S+/g, "<ruta>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<correo>")
    .replace(/\s+/g, " ").trim();
  return t.length > 400 ? t.slice(0, 400) + "…" : t;
}

/** «archivo.js:línea:columna» del primer punto de una traza, sin la ruta */
export const donde = (stack) => (String(stack || "").match(/([\w.-]+\.js:\d+:\d+)/) || [])[1] || "";

const fecha = (d = new Date()) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

/**
 * N: plugin nativo del motor (o null en el navegador). cancion(): texto de la canción en curso. Todo lo que falle aquí se ignora:
 * el registro nunca debe provocar otro error.
 */
export function crearRegistro({ N, version, cancion }) {
  const vistos = new Map();
  const local = () => { try { return globalThis.localStorage; } catch (_) { return null; } };
  return {
    async anotar(origen, mensaje) {
      try {
        const m = limpiar(mensaje); if (!m) return;
        const ahora = Date.now(); if (ahora - (vistos.get(m) || 0) < REPETIDO_MS) return;   // un error que se repite en bucle no llena el archivo
        vistos.set(m, ahora); if (vistos.size > 50) vistos.delete(vistos.keys().next().value);
        let c = ""; try { c = limpiar(cancion?.() || ""); } catch (_) { /* aún no hay reproductor */ }
        if (N) { await N.registroAnotar({ origen, cancion: c, mensaje: m }); return; }
        const ls = local(); if (!ls) return;
        let t = (ls.getItem(CLAVE) || "") + `${fecha()} | v${version} | ${origen} | ${c || "sin canción"} | ${m}\n`;
        if (t.length > MAX_LOCAL) t = t.slice(t.indexOf("\n", t.length - MAX_LOCAL / 2) + 1);
        ls.setItem(CLAVE, t);
      } catch (_) { /* nada */ }
    },
    async leer() { try { return N ? String((await N.registroLeer()).texto || "") : local()?.getItem(CLAVE) || ""; } catch (_) { return ""; } },
    async borrar() { try { if (N) await N.registroBorrar(); else local()?.removeItem(CLAVE); } catch (_) { /* nada */ } },
  };
}
