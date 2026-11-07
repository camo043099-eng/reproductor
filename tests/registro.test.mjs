import test from "node:test";
import assert from "node:assert/strict";
const { crearRegistro, limpiar, donde } = await import("../app/js/registro.js");

function memoria() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

test("limpiar quita rutas, enlaces y correos, y acota el largo", () => {
  const t = limpiar("falló content://media/external/audio/media/42 y /storage/emulated/0/Music/a.flac, https://x.com/u?id=1, yo@correo.com");
  assert.ok(!/content:|storage|https|@/.test(t), t);
  assert.ok(t.includes("<uri>") && t.includes("<ruta>") && t.includes("<correo>"));
  assert.ok(limpiar("x".repeat(1000)).length <= 401);
});

test("donde deja solo archivo:línea:columna de la traza", () => {
  assert.equal(donde("Error\n    at f (https://localhost/js/main.js:12:5)"), "main.js:12:5");
  assert.equal(donde(undefined), "");
});

test("sin motor: guarda fecha, versión y canción en localStorage, y se puede leer y borrar", async () => {
  globalThis.localStorage = memoria();
  const r = crearRegistro({ N: null, version: "9.9.9", cancion: () => "Tema — Artista" });
  await r.anotar("JS", "boom en main.js:1:1");
  const t = await r.leer();
  assert.match(t, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \| v9\.9\.9 \| JS \| Tema — Artista \| boom en main\.js:1:1\n$/);
  await r.borrar(); assert.equal(await r.leer(), "");
});

test("sin canción en curso, o si el reproductor aún no existe, no falla", async () => {
  globalThis.localStorage = memoria();
  const r = crearRegistro({ N: null, version: "1", cancion: () => { throw new ReferenceError("reproductor"); } });
  await r.anotar("JS", "uno"); assert.match(await r.leer(), /\| sin canción \| uno\n$/);
});

test("un error que se repite en bucle se anota una sola vez", async () => {
  globalThis.localStorage = memoria();
  const r = crearRegistro({ N: null, version: "1", cancion: () => "" });
  for (let i = 0; i < 100; i++) await r.anotar("JS", "igual");
  assert.equal((await r.leer()).split("\n").filter(Boolean).length, 1);
});

test("con motor: manda al plugin el mensaje ya limpio y nunca lanza", async () => {
  const llamadas = [];
  const N = { registroAnotar: async (a) => { llamadas.push(a); }, registroLeer: async () => ({ texto: "linea\n" }), registroBorrar: async () => { llamadas.push("borrar"); } };
  const r = crearRegistro({ N, version: "1", cancion: () => "T" });
  await r.anotar("JS", "mal en file:///sdcard/x.mp3");
  assert.deepEqual(llamadas[0], { origen: "JS", cancion: "T", mensaje: "mal en <uri>" });
  assert.equal(await r.leer(), "linea\n"); await r.borrar(); assert.equal(llamadas[1], "borrar");
  const roto = crearRegistro({ N: { registroAnotar: async () => { throw new Error("sin método"); }, registroLeer: async () => { throw new Error("x"); } }, version: "1", cancion: () => "" });
  await roto.anotar("JS", "a"); assert.equal(await roto.leer(), "");
});
