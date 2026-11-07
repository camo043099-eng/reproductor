// El motor Java no se puede ejecutar sin Android: esta prueba vigila el código fuente para que el reintento tras un fallo de AudioTrack
// no vuelva a arrancar la música en pausa (al abrir la app sonaba sola un instante antes de que la interfaz la pausara).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const java = readFileSync(new URL("../native/java/MotorPlugin.java", import.meta.url), "utf8");
const m = java.match(/public void onPlayerError[\s\S]*?\r?\n        \}\r?\n    \}/);

test("onPlayerError: los reintentos solo reproducen si antes estaba sonando", () => {
  assert.ok(m, "no encuentro onPlayerError");
  const cuerpo = m[0];
  assert.ok(!/\.play\(\)/.test(cuerpo.replace(/if \(sonaba\) [qp]\.play\(\)/g, "")), "hay un play() incondicional en onPlayerError");
  assert.equal((cuerpo.match(/getPlayWhenReady\(\)/g) || []).length, 2, "los dos reintentos deben leer getPlayWhenReady()");
});
