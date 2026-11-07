import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

test("las filas de canciones no usan content-visibility (con el teclado abierto trababa ~5 s la lista larga en el WebView de Android)", () => {
  const regla = css.match(/(^|\n)\.fila\s*\{[^}]*\}/);
  assert.ok(regla, "no encuentro la regla .fila");
  assert.ok(!/content-visibility/.test(regla[0]), ".fila no debe llevar content-visibility");
  assert.ok(!/contain-intrinsic-size/.test(regla[0]), ".fila no debe llevar contain-intrinsic-size");
});
