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

test("el modo selección no cambia la maquetación de las filas (display en .ck/.mas recalculaba miles de filas, ~250 ms)", () => {
  assert.ok(!/\.seleccion[^{]*\.ck\s*\{[^}]*display\s*:\s*(grid|flex|block)/.test(css), "la casilla no debe aparecer con display");
  assert.ok(!/\.seleccion[^{]*\.mas\s*\{[^}]*display\s*:\s*none/.test(css), "«más» no debe ocultarse con display:none");
  assert.match(css, /\.fila \.ck\s*\{[^}]*position:\s*absolute/, "la casilla va superpuesta");
});
