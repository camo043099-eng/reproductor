import test from "node:test"; import assert from "node:assert/strict";
import { leerAutoEQ, aTextoAutoEQ, respuesta, filtrosGrafico, ISO31, PICO } from "../app/js/eqpro.js";
test("lee un perfil AutoEQ", () => {
  const r = leerAutoEQ("Preamp: -6.2 dB\nFilter 1: ON PK Fc 105 Hz Gain 3.4 dB Q 0.70\nFilter 2: ON LSC Fc 60 Hz Gain 2 dB Q 0.7\nFilter 3: OFF PK Fc 1000 Hz Gain 1 dB Q 1\nFilter 4: ON HSC Fc 8000 Hz Gain -4 dB Q 0.7\nFilter 5: ON LP Fc 18000 Hz");
  assert.equal(r.pre, -6.2); assert.equal(r.filtros.length, 3); assert.equal(r.ignorados, 1);
  assert.deepEqual(r.filtros.map((x) => x.t), [0, 1, 2]); assert.equal(r.filtros[0].f, 105);
});
test("exportar e importar da lo mismo", () => {
  const f = [{ f: 100, g: 3, q: 1, t: 0 }, { f: 8000, g: -2, q: 0.7, t: 2 }];
  const r = leerAutoEQ(aTextoAutoEQ(f, -3)); assert.equal(r.pre, -3); assert.deepEqual(r.filtros, f);
});
test("máximo 32 filtros", () => {
  const t = Array.from({ length: 40 }, (_, i) => `Filter ${i + 1}: ON PK Fc ${100 + i} Hz Gain 1 dB Q 1`).join("\n");
  const r = leerAutoEQ(t); assert.equal(r.filtros.length, 32); assert.equal(r.recortados, 8);
});
test("la curva sube donde el filtro sube", () => {
  const r = respuesta([{ f: 1000, g: 6, q: 2, t: PICO }], [100, 1000, 10000]);
  assert.ok(Math.abs(r[1] - 6) < 0.05 && Math.abs(r[0]) < 0.5 && Math.abs(r[2]) < 0.5);
});
test("gráfico de 31 bandas", () => { assert.equal(ISO31.length, 31); assert.equal(filtrosGrafico(new Array(31).fill(0), 31).length, 31); });
