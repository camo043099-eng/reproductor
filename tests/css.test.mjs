import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

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

test("Onda tiene un único tema: no quedan Mornye, Nocturno, Onda original ni modo claro en CSS, HTML ni JS", () => {
  const leer = (r) => readFileSync(new URL("../app/" + r, import.meta.url), "utf8");
  const todo = [leer("styles.css"), leer("index.html"), leer("js/main.js"), ...["tokens", "navegacion", "reproductor", "inicio", "biblioteca", "esqueleto"].map((f) => leer(`css/${f}.css`))].join("\n");
  for (const mal of [/data-tema/, /data-fuente/, /dataset\.tema/, /dataset\.fuente/, /\[data-modo="claro"\]/, /mornye/i, /nocturno/, /aj-tema/, /aj-fuente/]) assert.ok(!mal.test(todo), `queda rastro de ${mal}`);
  const fuentes = readdirSync(new URL("../app/fonts/", import.meta.url)).filter((f) => /\.(ttf|woff2?)$/.test(f)); assert.deepEqual(fuentes, ["Montserrat-VF.ttf"]);
});

test("deslizar de lado no mueve la página ni pelea con el gesto de sección", () => {
  const css = readFileSync(new URL("../app/css/navegacion.css", import.meta.url), "utf8");
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /overscroll-behavior-x:\s*none/);
  assert.match(css, /#contenido\s*\{\s*touch-action:\s*pan-y/);
});

test("el gesto de cambio de sección no se activa sobre carruseles ni arrastra la pantalla en los extremos", () => {
  const js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  assert.match(js, /\.carril, \.acc-pista, \.acc-lista, \.indice, \[data-no-deslizar\]/);
  assert.match(js, /j >= 0 && j < SECCIONES\.length \? `\$\{dx \* 0\.25\}px 0` : ""/);
  assert.ok(!/id="aj-icono"/.test(readFileSync(new URL("../app/index.html", import.meta.url), "utf8")));
});

test("Ajustes: cada categoría del menú tiene su página y su título, y no hay páginas sueltas", () => {
  const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8"), js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  const cats = [...html.matchAll(/class="aj-cat"[^>]*data-ir="(\w+)"/g)].map((m) => m[1]).sort();
  const pags = [...html.matchAll(/class="aj-pag" data-pag="(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(cats, pags);
  const titulos = js.match(/const TITULOS_AJ = \{([^}]*)\}/)[1];
  for (const p of pags) assert.ok(new RegExp(`(^|[ ,])${p}:`).test(titulos), `falta el título de ${p}`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "ids duplicados en index.html");
});

test("Fase 5: hojas.css enlazado y en SHELL; la carátula de relleno va en la paleta de la app (sin letra ni tonos arcoíris)", () => {
  const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8"), sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8"), js = readFileSync(new URL("../app/js/main.js", import.meta.url), "utf8");
  assert.match(html, /css\/hojas\.css/); assert.ok(sw.includes('"css/hojas.css"'));
  const placa = js.slice(js.indexOf("function placa("), js.indexOf("const SIN = "));
  assert.ok(!/<text/.test(placa), "la carátula de relleno no lleva letra");
  assert.match(placa, /n % 60/);
  assert.ok(!/rgba\(255, ?69, ?58/.test(readFileSync(new URL("../app/styles.css", import.meta.url), "utf8").split("\n").filter((l) => /\.cq\.ahora|\.cat-b/.test(l)).join("\n")), "sin rojo fijo en la cola ni en las categorías");
});
