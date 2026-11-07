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
  for (const f of ["css/tokens.css", "css/navegacion.css", "css/reproductor.css", "css/inicio.css", "css/biblioteca.css", "css/esqueleto.css", "fonts/Montserrat-VF.ttf"]) {
    assert.ok(sw.includes(`"${f}"`), `${f} falta en SHELL de sw.js`);
    assert.ok(existsSync(new URL("../app/" + f, import.meta.url)), `${f} no existe`);
  }
  assert.match(html, /href="css\/tokens\.css"/); assert.match(html, /href="css\/navegacion\.css"/);
});

test("el acento rojo fijo ya no está escrito a mano: sale de --ac-1/--ac-2 (color de la carátula)", () => {
  const sin = css.split("\n").filter((l) => !/peligro/.test(l)).join("\n");
  assert.ok(!/#ff453a|255, 69, 58/i.test(sin.replace(/var\(--ac2, #ff453a\)/g, "")), "queda el rojo #ff453a escrito a mano");
});

test("rediseño Fase 2: sin visualizador ni ondas de frecuencia, y el reproductor tiene carátula circular con anillo de progreso", () => {
  const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8"), js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  for (const x of ["r-ondas", "r-viz", "aj-viz", "aj-ritmo", "cd-brillo"]) assert.ok(!html.includes(x), `index.html aún tiene ${x}`);
  for (const x of ["ritmoEncender", "vizEncender", "nivelRitmo", "espectro("]) assert.ok(!js.includes(x), `main.js aún tiene ${x}`);
  assert.match(html, /id="r-anillo"/); assert.match(js, /strokeDashoffset/);
  const rep = readFileSync(new URL("../app/css/reproductor.css", import.meta.url), "utf8");
  assert.match(rep, /\.rep-disco/); assert.match(rep, /border-radius:\s*50%/);
});

test("esqueletos de carga: el Inicio trae uno en el HTML, las carátulas pendientes pulsan y todo respeta «menos movimiento»", () => {
  const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8"), esq = readFileSync(new URL("../app/css/esqueleto.css", import.meta.url), "utf8"), js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  assert.match(html, /class="esq-inicio"/); assert.match(js, /dataset\.cargando/); assert.match(esq, /prefers-reduced-motion/);
  assert.ok(!/(^|\n)[^{}]*\{[^}]*(left|top|width|height)\s*:[^}]*\}\s*@keyframes/.test(esq), "el esqueleto solo debe animar transform y opacity");
  const anims = [...esq.matchAll(/@keyframes[^{]+\{([^]*?\})\s*\}/g)].map((m) => m[1]).join(" "); assert.ok(!/(left|top|width|height|margin)\s*:/.test(anims), "keyframes con propiedades de maquetación");
});

test("el pulso de carátula pendiente solo se pone a las imágenes a la vista (con miles de animaciones a la vez se bloqueaba la búsqueda ~1 s)", () => {
  const js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  const imagenes = js.match(/function imagenes\(raiz\)[^\n]*/)[0];
  assert.ok(!/cargando/.test(imagenes), "imagenes() no debe marcar data-cargando: eso lo hace el IntersectionObserver");
  assert.match(js.match(/const vigia[\s\S]*?\}, \{ rootMargin/)[0], /dataset\.cargando/);
});
