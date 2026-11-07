import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

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

test("el service worker guarda en caché los CSS y la fuente del rediseño, y index.html los enlaza", () => {
  const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8"), html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
  for (const f of ["css/tokens.css", "css/navegacion.css", "fonts/Montserrat-VF.ttf"]) {
    assert.ok(sw.includes(`"${f}"`), `${f} falta en SHELL de sw.js`);
    assert.ok(existsSync(new URL("../app/" + f, import.meta.url)), `${f} no existe`);
  }
  assert.match(html, /href="css\/tokens\.css"/); assert.match(html, /href="css\/navegacion\.css"/);
});

test("el acento rojo fijo ya no está escrito a mano: sale de --ac-1/--ac-2 (color de la carátula)", () => {
  const sin = css.split("\n").filter((l) => !/peligro/.test(l)).join("\n");
  assert.ok(!/#ff453a|255, 69, 58/i.test(sin.replace(/var\(--ac2, #ff453a\)/g, "")), "queda el rojo #ff453a escrito a mano");
});
