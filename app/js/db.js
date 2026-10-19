// Almacenamiento en el teléfono (IndexedDB): datos de las canciones, los archivos de audio, las portadas y las listas.
// Todo queda en el dispositivo; nada se sube a ninguna parte.

const NOMBRE = "onda-musica", VERSION = 1;
let _db = null;

function abrir() {
  if (_db) return _db;
  _db = new Promise((ok, mal) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("canciones", { keyPath: "id" });
      d.createObjectStore("archivos");                       // id → Blob de audio
      d.createObjectStore("portadas");                       // clave de álbum → Blob miniatura
      d.createObjectStore("listas", { keyPath: "id" });
      d.createObjectStore("ajustes");
    };
    r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
  });
  return _db;
}
const pedir = (req) => new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });
async function tx(almacen, modo, f) {
  const d = await abrir(), t = d.transaction(almacen, modo), r = f(t.objectStore(almacen));
  const v = r && r.onsuccess !== undefined ? await pedir(r) : undefined;
  await new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = () => mal(t.error); t.onabort = () => mal(t.error); });
  return v;
}
export const poner = (a, valor, clave) => tx(a, "readwrite", (s) => (clave === undefined ? s.put(valor) : s.put(valor, clave)));
export const traer = (a, clave) => tx(a, "readonly", (s) => s.get(clave));
export const todo = (a) => tx(a, "readonly", (s) => s.getAll());
export const borrar = (a, clave) => tx(a, "readwrite", (s) => s.delete(clave));
export const claves = (a) => tx(a, "readonly", (s) => s.getAllKeys());
export const vaciar = (a) => tx(a, "readwrite", (s) => s.clear());

/** id estable por archivo: mismo nombre, tamaño y fecha = misma canción (evita duplicados al volver a importar). */
export function idDe(file) {
  const s = `${file.name}|${file.size}|${file.lastModified}`; let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + file.size.toString(36);
}
export async function espacio() {
  try { const e = await navigator.storage.estimate(); return { usado: e.usage || 0, cupo: e.quota || 0 }; } catch (_) { return { usado: 0, cupo: 0 }; }
}
export async function pedirPersistencia() { try { return await navigator.storage.persist(); } catch (_) { return false; } }

/** guarda y borra muchas filas en una sola operación (rápido aunque sean miles) */
export async function lote(almacen, poner = [], quitar = []) {
  const d = await abrir(), t = d.transaction(almacen, "readwrite"), st = t.objectStore(almacen);
  for (const v of poner) st.put(v); for (const k of quitar) st.delete(k);
  await new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = () => mal(t.error); t.onabort = () => mal(t.error); });
}
