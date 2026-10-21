import test from "node:test";
import assert from "node:assert/strict";
globalThis.CustomEvent = globalThis.CustomEvent || class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } };
const { ReproductorNativo } = await import("../app/js/nativo.js");

function falso() {
  const llamadas = [], oyentes = {};
  const N = new Proxy({ addListener: (n, f) => { oyentes[n] = f; return Promise.resolve(); } }, { get: (t, k) => (k in t ? t[k] : (a) => { llamadas.push([k, a]); return Promise.resolve(); }) });
  return { N, llamadas, oyentes };
}
const canc = (n) => Array.from({ length: n }, (_, i) => ({ id: "ms" + i, uri: "content://x/" + i, titulo: "T" + i, duracion: 100 }));

test("cargar cola manda las canciones en orden y avisa", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); const l = canc(5);
  await r.cargarCola(l, 2, true);
  const c = f.llamadas.find((x) => x[0] === "cargar")[1];
  assert.equal(c.indice, 2); assert.deepEqual(c.items.map((x) => x.id), ["ms0", "ms1", "ms2", "ms3", "ms4"]); assert.equal(r.actual.id, "ms2"); assert.equal(r.sonando, true);
});
test("aleatorio: la actual queda primera y están todas", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); r.ponerAleatorio(true); await r.cargarCola(canc(8), 3, true);
  assert.equal(r.pos, 0); assert.equal(r.actual.id, "ms3"); assert.equal(new Set(r.lista.map((s) => s.id)).size, 8);
});
test("apagar el aleatorio vuelve al orden original y conserva la que suena", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); r.ponerAleatorio(true); await r.cargarCola(canc(8), 3, true);
  r.ponerAleatorio(false); assert.deepEqual(r.lista.map((s) => s.id), canc(8).map((s) => s.id)); assert.equal(r.actual.id, "ms3"); assert.equal(r.pos, 3);
  const re = f.llamadas.filter((x) => x[0] === "reordenar"); assert.equal(re.length, 1); assert.equal(re[0][1].indice, 3);
});
test("insertar, quitar y mover mantienen la posición y se reflejan en el motor", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); await r.cargarCola(canc(4), 1, true);
  r.siguienteLuego({ id: "nuevo", uri: "u" }); assert.equal(r.lista[2].id, "nuevo"); assert.deepEqual(f.llamadas.find((x) => x[0] === "insertar")[1].indice, 2);
  r.quitarDeCola(0); assert.equal(r.pos, 0); assert.equal(r.actual.id, "ms1");
  r.mover(0, 1); assert.equal(r.pos, 1); assert.equal(r.actual.id, "ms1"); assert.equal(r.lista[0].id, "nuevo");
  r.quitarDeCola(1); assert.equal(r.lista.length, 4, "no se puede quitar la que suena");
});
test("eventos del motor actualizan posición, tiempo y estado", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); await r.cargarCola(canc(3), 0, false);
  let cambios = 0; r.addEventListener("cambio", () => cambios++);
  f.oyentes.cambio({ indice: 2, id: "ms2" }); assert.equal(r.pos, 2); assert.equal(cambios, 1);
  f.oyentes.tiempo({ pos: 12500, dur: 200000, indice: 2 }); assert.equal(r.tiempo, 12.5); assert.equal(r.duracion, 200);
  f.oyentes.estado({ sonando: true, pos: 12500, dur: 200000, indice: 2 }); assert.equal(r.sonando, true);
  f.oyentes.detalles({ id: "ms2", sampleRate: 96000, bits: 24 }); assert.equal(r.lista[2].bits, 24);
});
test("ecualizador y temporizador envían lo correcto", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); r.usarPreset("Bajos"); r.ponerPreamp(3);
  const e = f.llamadas.filter((x) => x[0] === "eq").pop()[1]; assert.equal(e.bandas[0], 6); assert.equal(e.pre, 3); assert.equal(e.on, true);
  r.dormir(15); assert.ok(r.dormirRestante > 14 * 60000); assert.deepEqual(f.llamadas.find((x) => x[0] === "dormir")[1], { minutos: 15 });
  r.dormir(0); assert.equal(r.dormirRestante, 0);
});
test("espacial y resincronizar", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); await r.cargarCola(canc(3), 0, true);
  r.ancho = 50; r.env = 30; r.graves = 10; r.ponerEspacial();
  assert.deepEqual(f.llamadas.filter((x) => x[0] === "espacial").pop()[1], { ancho: 0.5, env: 300, graves: 100 });
  f.N.estado = async () => ({ ids: ["ms0", "ms1", "ms2"], indice: 2, pos: 9000, dur: 200000, sonando: true });
  await r.resincronizar(); assert.equal(r.pos, 2); assert.equal(r.sonando, true); assert.equal(r.tiempo, 9);
});

test("play nunca recarga la cola: manda alternar al motor, que ya tiene la sesión restaurada", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); r.lista = canc(3); r.pos = 1; r._pos = 42;
  await r.alternar(); await r.alternar();
  assert.equal(f.llamadas.some((x) => x[0] === "cargar"), false, "play no debe cargar la cola");
  assert.equal(f.llamadas.filter((x) => x[0] === "alternar").length, 2);
});
test("play con cola ya cargada usa alternar normal", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); await r.cargarCola(canc(3), 0, false);
  f.llamadas.length = 0; await r.alternar();
  assert.equal(f.llamadas.some((x) => x[0] === "cargar"), false); assert.equal(f.llamadas.some((x) => x[0] === "alternar"), true);
});

test("moverA: reordena con arrastre y la posición sigue a la canción que suena", async () => {
  const f = falso(), r = new ReproductorNativo(f.N); const l = canc(6);
  await r.cargarCola(l, 2, true);                       // suena la 3ª (índice 2)
  const suena = r.lista[r.pos];
  r.moverA(0, 4);                                       // una de antes → después de la que suena
  assert.equal(r.lista[r.pos], suena); assert.equal(r.pos, 1);
  r.moverA(5, 0);                                       // una de después → al principio
  assert.equal(r.lista[r.pos], suena); assert.equal(r.pos, 2);
  r.moverA(r.pos, 0);                                   // la que suena → al principio
  assert.equal(r.pos, 0); assert.equal(r.lista[0], suena);
  r.moverA(3, 99);                                      // destino fuera de rango se ajusta al final
  assert.equal(r.lista.length, 6);
});
