import test from "node:test"; import assert from "node:assert/strict";
import { crearMixes, peso, bloqueDe } from "../app/js/recomendador.js";
const gen = (s) => (s.genero ? [s.genero] : []);
const clave = (s) => s.id;
const lib = [];
for (let a = 0; a < 6; a++) for (let i = 0; i < 12; i++) lib.push({ id: `a${a}s${i}`, titulo: `T${i}`, artista: `Artista${a}`, album: `Disco${a}`, alb: `disco${a}`, genero: a < 3 ? "Rock" : "Pop", duracion: 200, fecha: a * 100 + i });
const dia = "2026-10-19", ahora = Date.parse("2026-10-19T20:00:00");
test("sin historial: mix de arranque y aviso de que está aprendiendo", () => {
  const r = crearMixes({ canciones: lib, hist: { m: {} }, ahora, dia, claveC: clave, generosDe: gen });
  assert.equal(r.aprendiendo, true); assert.equal(r.mixes[0].id, "hoy"); assert.ok(r.mixes[0].ids.length >= 20);
});
test("aprende: lo que más escuchas pesa más y el mix del día lo prioriza", () => {
  const m = {}; for (let i = 0; i < 12; i++) m[`a0s${i}`] = { n: 6, u: ahora - 3 * 864e5, ms: 6 * 200000, hr: [0, 0, 0, 6] };
  const r = crearMixes({ canciones: lib, hist: { m }, ahora, dia, claveC: clave, generosDe: gen, bloque: 3 });
  assert.equal(r.aprendiendo, false);
  const hoy = r.mixes.find((x) => x.id === "hoy"), deA0 = hoy.ids.filter((id) => id.startsWith("a0")).length;
  assert.ok(deA0 >= 3, "el artista favorito aparece (" + deA0 + ")");
  assert.ok(r.mixes.some((x) => x.id === "art0" && x.nombre.includes("Artista0")), "mix del artista favorito");
  const des = r.mixes.find((x) => x.id === "descubre"); assert.ok(des.ids.every((id) => !(m[id] && m[id].n > 0)), "descubre solo trae lo no escuchado");
});
test("lo saltado y lo muy reciente se castigan", () => {
  const s = { id: "x", duracion: 200 };
  assert.ok(peso(s, { n: 5, u: ahora, ms: 1e6, sk: 0 }, ahora) > peso(s, { n: 5, u: ahora, ms: 1e6, sk: 4 }, ahora));
  assert.ok(peso(s, { n: 5, u: ahora - 200 * 864e5, ms: 1e6 }, ahora) < peso(s, { n: 5, u: ahora - 1 * 864e5, ms: 1e6 }, ahora), "lo antiguo pesa menos");
});
test("determinista por día y cambia al día siguiente", () => {
  const m = {}; for (let i = 0; i < 12; i++) m[`a1s${i}`] = { n: 3, u: ahora - 864e5 * 5, ms: 3e5 };
  const f = (d) => crearMixes({ canciones: lib, hist: { m }, ahora, dia: d, claveC: clave, generosDe: gen }).mixes.find((x) => x.id === "hoy").ids.join();
  assert.equal(f("2026-10-19"), f("2026-10-19")); assert.notEqual(f("2026-10-19"), f("2026-10-20"));
});
test("no repite el mismo artista tres veces seguidas", () => {
  const m = {}; for (const s of lib) m[s.id] = { n: 2, u: ahora - 864e5 * 3, ms: 4e5 };
  const ids = crearMixes({ canciones: lib, hist: { m }, ahora, dia, claveC: clave, generosDe: gen }).mixes.find((x) => x.id === "hoy").ids;
  for (let i = 2; i < ids.length; i++) assert.ok(!(ids[i].slice(0, 2) === ids[i - 1].slice(0, 2) && ids[i].slice(0, 2) === ids[i - 2].slice(0, 2)), "tres seguidas en " + i);
});
test("bloques del día", () => { assert.equal(bloqueDe(new Date("2026-10-19T03:00:00")), 0); assert.equal(bloqueDe(new Date("2026-10-19T20:00:00")), 3); });
