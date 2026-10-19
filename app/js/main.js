import { Reproductor, BANDAS, PRESETS } from "./player.js";
import { leerEtiquetas } from "./tags.js";
import * as db from "./db.js";
import { ReproductorNativo } from "./nativo.js";
import { buscarPortadaUrl, buscarLetraCompleta, traducir, parsearLRC, lineaActual } from "./internet.js";
import { deslizar, arrastrarHoja, vibra } from "./gestos.js";

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), mas: svg('<path d="M12 5v14M5 12h14"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  play: svg('<path d="M8 5v14l11-7z"/>'), pausa: svg('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
  sig: svg('<path d="M6 5v14l9-7zM17 5h2v14h-2z"/>'), ant: svg('<path d="M18 5v14l-9-7zM5 5h2v14H5z"/>'),
  abajo: svg('<path d="M6 9l6 6 6-6"/>'), cola: svg('<path d="M4 6h16M4 12h16M4 18h9"/>'),
  azar: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  rep: svg('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>'),
  fav: svg('<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.500-7 10-7 10z"/>'),
  eq: svg('<path d="M5 4v16M12 4v16M19 4v16M3 14h4M10 8h4M17 15h4"/>'),
  luna: svg('<path d="M20 14.500A8 8 0 019.500 4 8 8 0 1020 14.500z"/>'), lista: svg('<path d="M4 6h12M4 12h12M4 18h7M18 15v6M15 18h6"/>'),
  letra: svg('<path d="M4 6h16M4 11h11M4 16h16M4 21h8"/>'), volver: svg('<path d="M15 5l-7 7 7 7"/>'), mas3: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.800"/><circle cx="12" cy="12" r="1.800"/><circle cx="12" cy="19" r="1.800"/></svg>',
};
const ponerIconos = () => {
  const m = { "#b-agregar": I.mas, "#b-ajustes": I.ajustes, "#mini-sig": I.sig, "#r-cola": I.cola, "#r-azar": I.azar, "#r-ant": I.ant, "#r-sig": I.sig, "#r-rep": I.rep, "#r-fav": I.fav, "#r-eq": I.eq, "#r-sueno": I.luna, "#r-lista": I.lista, "#r-letra": I.letra };
  for (const [k, v] of Object.entries(m)) $(k).innerHTML = v;
  document.querySelectorAll("[data-cerrar]").forEach((b) => { b.innerHTML = I.abajo; });
};
ponerIconos();

const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`; };
const colador = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── estado ──
const E = { version: 0, vista: "inicio", canciones: [], listas: [], tab: "canciones", orden: "titulo", q: "", detalle: null, aj: {} };
const porId = new Map();
const urlsPort = new Map();                                              // clave de álbum → URL o null
let reproductor;
const plug = (n) => { const C = window.Capacitor; if (!C?.isNativePlatform?.()) return null; return C.Plugins?.[n] || C.registerPlugin?.(n) || null; };
const MOTOR = plug("Motor");                                              // existe solo dentro de la app Android

async function portadaUrl(alb) {
  if (!alb) return null;
  if (urlsPort.has(alb)) return urlsPort.get(alb);
  const b = await db.traer("portadas", alb).catch(() => null);
  const u = b ? URL.createObjectURL(b) : null; urlsPort.set(alb, u); return u;
}
const SIN = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#17171d"/><path d="M19 32V15l14-3v17" fill="none" stroke="#6b6b7a" stroke-width="2.500"/><circle cx="16" cy="32" r="3.500" fill="#6b6b7a"/><circle cx="30" cy="29" r="3.500" fill="#6b6b7a"/></svg>');
const vigia = "IntersectionObserver" in window ? new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { vigia.unobserve(e.target); hidratar(e.target); }
}, { rootMargin: "200px" }) : null;
async function hidratar(img) { const u = await portadaUrl(img.dataset.alb); if (u) img.src = u; }
function imagenes(raiz) { raiz.querySelectorAll("img[data-alb]:not([data-obs])").forEach((i) => { i.dataset.obs = "1"; if (!i.dataset.alb) return; if (vigia) vigia.observe(i); else hidratar(i); }); }
const imgsDe = (alb) => document.querySelectorAll(`img[data-alb="${CSS.escape(alb)}"]`);

// pinta listas largas por tandas: lo primero aparece al instante y el resto llega entre cuadros, sin congelar la pantalla
let tokenPintado = 0, forzarPintado = () => {};
function pintar(c, items, f, envoltura) {
  const mi = ++tokenPintado, N = 40; forzarPintado = () => {};
  c.innerHTML = envoltura(items.slice(0, N).map(f).join(""));
  const cont = c.querySelector("[data-tandas]"); let i = N;
  const paso = () => {
    if (mi !== tokenPintado || !cont.isConnected || i >= items.length) return;
    const fin = Math.min(items.length, i + 120); let h = ""; for (let k = i; k < fin; k++) h += f(items[k], k);
    cont.insertAdjacentHTML("beforeend", h); i = fin; imagenes(cont); requestAnimationFrame(paso);
  };
  forzarPintado = () => { if (mi !== tokenPintado || i >= items.length) return; let h = ""; for (let k = i; k < items.length; k++) h += f(items[k], k); cont.insertAdjacentHTML("beforeend", h); i = items.length; imagenes(cont); };
  if (items.length > N) requestAnimationFrame(paso);
  imagenes(c);
}
const imgHtml = (s, cls = "") => `<img class="${cls}" src="${SIN}" data-alb="${esc(s.alb || "")}" alt="" loading="lazy" decoding="async">`;

// ── aviso ──
let tAviso;
function avisar(t, ms = 2800) { const a = $("#aviso"); a.textContent = t; a.hidden = false; clearTimeout(tAviso); if (ms) tAviso = setTimeout(() => { a.hidden = true; }, ms); }

// ── biblioteca ──
const RUIDO = /\/(whatsapp[^/]*|recordings?|voice recorder|sound recorder|call recordings?|notifications?|ringtones?|alarms?)\//i;
function filtradas(lista) {
  const sis = E.aj.sistema !== false, min = +E.aj.minSeg || 0;
  return lista.filter((s) => !(sis && RUIDO.test("/" + (s.carpeta || "") + "/")) && !(min && s.duracion && s.duracion < min));
}
async function cargarTodo() {
  E.canciones = filtradas(await db.todo("canciones")); E.listas = await db.todo("listas");
  porId.clear(); E.version++; for (const s of E.canciones) porId.set(s.id, s);
}
function claveAlbum(t) { return normal((t.albumArtista || t.artista || "") + "|" + (t.album || "")); }
async function miniatura(blob) {
  try {
    const bmp = await createImageBitmap(blob), k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  } catch (_) { return null; }
}
const ES_AUDIO = /\.(flac|mp3|m4a|aac|ogg|oga|opus|wav|alac|aiff?|wma|weba)$/i;
let importando = false;
async function importar(lista) {
  if (importando) { avisar("Ya estoy importando, espera un momento."); return; }
  const archivos = [...lista].filter((f) => ES_AUDIO.test(f.name) || (f.type || "").startsWith("audio/"));
  if (!archivos.length) { avisar("No encontré canciones en lo que elegiste."); return; }
  importando = true; let nuevas = 0, repetidas = 0, malas = 0;
  for (let i = 0; i < archivos.length; i++) {
    const meta = archivos[i]; avisar(`Importando ${i + 1} de ${archivos.length}…`, 0);
    try {
      const id = db.idDe(meta);
      if (porId.has(id)) { repetidas++; continue; }
      const f = typeof meta.cargar === "function" ? await meta.cargar() : meta;
      const t = await leerEtiquetas(f), alb = claveAlbum(t);
      if (t.portada && !(await db.traer("portadas", alb))) { const m = await miniatura(t.portada); if (m) await db.poner("portadas", m, alb); }
      const { portada, ...datos } = t;
      const s = { id, nombre: f.name, tam: f.size, fecha: Date.now() + i, fav: false, alb, ...datos };
      await db.poner("archivos", f, id); await db.poner("canciones", s);
      E.canciones.push(s); porId.set(id, s); nuevas++;
    } catch (_) { malas++; }
    if (i % 10 === 9) { await new Promise((r) => setTimeout(r)); }
  }
  importando = false; E.version++;
  avisar(`Listo: ${nuevas} nueva${nuevas === 1 ? "" : "s"}${repetidas ? `, ${repetidas} ya estaban` : ""}${malas ? `, ${malas} con error` : ""}.`, 4500);
  await db.pedirPersistencia(); dibujar(); mostrarEspacio();
}

// ── carpeta (en la app Android se usa el selector nativo; en el navegador, el de archivos) ──
async function elegirCarpeta() {
  const N = window.Capacitor?.Plugins?.Carpeta;
  if (!N) return $("#f-carpeta").click();
  try {
    avisar("Leyendo la carpeta…", 0); const r = await N.elegir();
    const items = (r.archivos || []).map((a) => ({
      name: a.nombre, size: a.tam, lastModified: a.fecha, type: a.mime || "",
      async cargar() {
        const c = await N.copiar({ uri: a.uri, id: String(a.fecha) + "_" + a.tam });
        try { const b = await (await fetch(window.Capacitor.convertFileSrc(c.ruta))).blob(); return new File([b], a.nombre, { lastModified: a.fecha, type: a.mime || b.type }); }
        finally { N.borrar({ ruta: c.ruta }).catch(() => {}); }
      },
    }));
    if (!items.length) return avisar("No hay canciones en esa carpeta.");
    importar(items);
  } catch (e) { avisar(/cancel/i.test(String(e?.message || e)) ? "No elegiste ninguna carpeta." : "No pude leer la carpeta."); }
}

// ── listados ──
let cacheOrden = { clave: "", lista: null };
function ordenadas() { const clave = E.orden + "|" + E.version; if (cacheOrden.clave !== clave) cacheOrden = { clave, lista: ordenar(E.canciones) }; return cacheOrden.lista; }
function ordenar(arr) {
  const k = E.orden, c = (a, b) => colador.compare(a, b);
  const f = { titulo: (a, b) => c(a.titulo || a.nombre, b.titulo || b.nombre), artista: (a, b) => c(a.artista, b.artista) || c(a.album, b.album) || (a.disco - b.disco) || (a.pista - b.pista), album: (a, b) => c(a.album, b.album) || (a.disco - b.disco) || (a.pista - b.pista), reciente: (a, b) => b.fecha - a.fecha }[k];
  return arr.slice().sort(f);
}
const SINONIMOS = [[/sound\s?track|sountrack|\bost\b|banda sonora|サウンドトラック|原声/i, "Banda sonora"], [/video\s?game|^game|テレビゲーム|ゲーム|videojuego/i, "Videojuegos"], [/^j-?pop$|^jpop$/i, "J-Pop"], [/^pop$|ポップ/i, "Pop"], [/^rock$|ロック/i, "Rock"],
  [/electro|electr[oó]nic|エレクトロ/i, "Electrónica"], [/hip.?hop|^rap$/i, "Hip-Hop"], [/anime|アニメ/i, "Anime"], [/classical|クラシック|cl[aá]sica/i, "Clásica"], [/metal|メタル/i, "Metal"], [/^dance$/i, "Dance"], [/r&b|^rnb$/i, "R&B"], [/jazz|ジャズ/i, "Jazz"]];
function generosDe(s) {
  if (s._g) return s._g; const out = new Set();
  for (const raw of String(s.genero || "").split(/[;,/|]+/)) { const t = raw.trim(); if (!t) continue; const m = SINONIMOS.find(([re]) => re.test(t)); out.add(m ? m[1] : t.charAt(0).toUpperCase() + t.slice(1)); }
  return (s._g = [...out]);
}
const conteoGeneros = () => { const g = new Map(); for (const s of E.canciones) for (const x of generosDe(s)) g.set(x, (g.get(x) || 0) + 1); return g; };
const coincide = (s, q) => !q || (s._b ||= normal([s.titulo, s.artista, s.album, s.nombre, s.genero, s.anio].join(" "))).includes(q);
function filaCancion(s, i, extra = "") {
  const sonando = reproductor.actual?.id === s.id;
  return `<li class="fila${sonando ? " sonando" : ""}" data-i="${i}" data-id="${esc(s.id)}" tabindex="0">${imgHtml(s)}<span class="info"><b>${esc(s.titulo || s.nombre)}</b><span>${esc(s.artista || "Artista desconocido")}${extra}</span></span><span class="dur">${fmt(s.duracion)}</span><button class="mas" type="button" data-mas aria-label="Más opciones">${I.mas3}</button></li>`;
}
function agrupar(clave) {
  const m = new Map();
  for (const s of E.canciones) { const k = clave(s); if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
  return m;
}
function vacio() {
  if (MOTOR) return `<div class="vacio"><p><b>${E.sinPermiso ? "Falta el permiso para leer tu música" : "No encontré música en tu teléfono"}</b></p><p>${E.sinPermiso ? "Onda lee tus canciones directamente, sin copiarlas. Dale permiso para ver la música." : "Cuando guardes canciones en el teléfono, toca Actualizar."}</p><button class="boton primario" data-agregar type="button">${E.sinPermiso ? "Dar permiso" : "Actualizar"}</button></div>`;
  return `<div class="vacio"><p><b>Tu biblioteca está vacía</b></p><p>Agrega canciones o una carpeta de música desde tu teléfono. Los archivos se copian dentro de la app y funcionan sin internet.</p><button class="boton primario" data-agregar type="button">Agregar música</button></div>`;
}
let listaActual = [];                                                      // canciones mostradas, para tocar y seguir en la cola
const saludo = () => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };
const IN = { inicio: svg('<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>'), buscar: I.buscar, biblioteca: svg('<path d="M5 4v16M10 4v16M15 5l4 14"/>') };
function animarCambio() { const c = $("#contenido"); c.classList.remove("entra"); void c.offsetWidth; c.classList.add("entra"); }
function dibujar() {
  tokenPintado++;
  const v = E.vista;
  $("#titulo-vista").textContent = v === "inicio" ? saludo() : v === "buscar" ? "Buscar" : "Tu biblioteca";
  $("#buscador").hidden = !(v === "buscar" || (v === "biblioteca" && !E.detalle)); $("#q").placeholder = v === "buscar" ? "¿Qué quieres escuchar?" : "Buscar en tu biblioteca…"; $("#indice").hidden = true; $("#pestanas").hidden = v !== "biblioteca"; $("#barra-orden").hidden = true;
  { const t = document.querySelector("[data-t=carpetas]"); if (t) t.hidden = !E.canciones.some((x) => x.carpeta); }
  document.querySelectorAll("#nav button").forEach((b) => { const a = b.dataset.v === v; a ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); b.firstElementChild.innerHTML = IN[b.dataset.v]; });
  if (v !== "biblioteca" && !E.canciones.length) { $("#contenido").innerHTML = vacio(); return; }
  if (v === "inicio") return dibujarInicio(); if (v === "buscar") return dibujarBuscar(); dibujarBiblioteca();
}
let listasInicio = { fav: [], rec: [], ult: [], mas: [] };
function dibujarInicio() {
  const c = $("#contenido"), rec = [...E.canciones].sort((a, b) => b.fecha - a.fecha), fav = E.canciones.filter((s) => s.fav);
  const ult = ultimasEscuchadas(), mas = masEscuchadas(), nuevas = sinEscuchar();
  const albs = [...agrupar((s) => s.alb)].map(([k, v]) => ({ k, s: v[0], n: v.length, f: Math.max(...v.map((x) => x.fecha)) })).sort((a, b) => b.f - a.f);
  const alb = (s) => albs.find((a) => a.k === s.alb);
  const albsUlt = []; for (const s of ult) { const a = alb(s); if (a && !albsUlt.includes(a)) albsUlt.push(a); if (albsUlt.length >= 12) break; }
  const arts = [...agrupar((s) => normal(s.albumArtista || s.artista))].map(([k, v]) => ({ k, s: v[0], n: v.length })).sort((a, b) => b.n - a.n).slice(0, 12);
  const gen = conteoGeneros();
  const generos = [...gen].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
  listasInicio = { fav: fav.slice(0, 20), rec: rec.slice(0, 20), ult: ult.slice(0, 20), mas: mas.slice(0, 20) };
  const tono = (t) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const tile = (d, k, ico, t) => `<button class="tile" type="button" data-det="${d}" data-k="${esc(k)}">${ico}<b>${esc(t)}</b></button>`;
  const ic = (svg, col) => `<span class="sinport fav" style="color:${col}">${svg}</span>`;
  const tiles = [tile("lista", "__fav", ic(I.fav.replace("<svg", '<svg fill="currentColor"'), "var(--ac2)"), "Favoritas")];
  if (mas.length) tiles.push(tile("lista", "__mas", ic(I.fav.replace("<svg", '<svg fill="currentColor"'), "#ffb44d"), "Más escuchadas"));
  if (ult.length) tiles.push(tile("lista", "__ult", ic(I.lista.replace("<svg", '<svg fill="none" stroke="currentColor" stroke-width="1.6"'), "#4da3ff"), "Escuchadas hace poco"));
  for (const a of (albsUlt.length ? albsUlt : albs)) { if (tiles.length >= 8) break; tiles.push(`<button class="tile" type="button" data-det="album" data-k="${esc(a.k)}">${imgHtml(a.s)}<b>${esc(a.s.album || "Sin álbum")}</b></button>`); }
  const estante = (t, h) => h ? `<section class="estante"><h3>${t}</h3><div class="carril">${h}</div></section>` : "";
  const cancion = (s, i, lista) => `<button class="tarjeta" type="button" data-lista="${lista}" data-i="${i}">${imgHtml(s)}<b>${esc(s.titulo || s.nombre)}</b><span>${esc(s.artista || "")}</span></button>`;
  const albumTarjeta = (a, grande) => `<button class="tarjeta${grande ? " grande" : ""}" type="button" data-det="album" data-k="${esc(a.k)}">${imgHtml(a.s)}<b>${esc(a.s.album || "Sin álbum")}</b><span>${esc(a.s.albumArtista || a.s.artista || "")}</span></button>`;
  const mix = (k, nombre, s, etiqueta) => `<button class="mix" type="button" data-det="lista" data-k="${esc(k)}" style="--h:${tono(nombre)}">${imgHtml(s)}<i>${etiqueta}</i><b>${esc(nombre)}</b></button>`;
  const mixes = generos.map(([g]) => mix("__gen:" + g, "Mix " + g, E.canciones.find((s) => generosDe(s).includes(g)), "MIX")).concat(nuevas.length > 10 ? [mix("__olv", "Para redescubrir", nuevas[Math.floor(nuevas.length / 2)], "SIN ESCUCHAR")] : []).join("");
  const fichas = [`<button class="chip mezcla" data-mezclar type="button">Mezclar todo</button>`, `<button class="chip" data-det="lista" data-k="__fav" type="button">Favoritas</button>`, `<button class="chip" data-estadisticas type="button">Tu actividad</button>`, `<button class="chip" data-portadas type="button">Descargar carátulas</button>`,
    ...generos.slice(0, 5).map(([g]) => `<button class="chip" data-det="lista" data-k="${esc("__gen:" + g)}" type="button">${esc(g)}</button>`),
    `<button class="chip" data-ir="canciones" type="button">Canciones</button>`, `<button class="chip" data-ir="albumes" type="button">Álbumes</button>`, `<button class="chip" data-ir="artistas" type="button">Artistas</button>`, `<button class="chip" data-ir="listas" type="button">Listas</button>`];
  c.innerHTML = `<div class="fichas">${fichas.join("")}</div>
  <div class="tiles">${tiles.join("")}</div>
  ${estante("Vuelve a tu música", albsUlt.slice(0, 10).map((a) => albumTarjeta(a, true)).join(""))}
  ${estante("Tus mixes", mixes)}
  ${estante("Escuchadas hace poco", listasInicio.ult.map((s, i) => cancion(s, i, "ult")).join(""))}
  ${estante("Más escuchadas", listasInicio.mas.map((s, i) => cancion(s, i, "mas")).join(""))}
  ${estante("Agregado recientemente", albs.slice(0, 12).map((a) => albumTarjeta(a)).join(""))}
  ${estante("Tus favoritas", listasInicio.fav.map((s, i) => cancion(s, i, "fav")).join(""))}
  ${estante("Canciones nuevas", listasInicio.rec.map((s, i) => cancion(s, i, "rec")).join(""))}
  ${estante("Artistas", arts.map((a) => `<button class="tarjeta redonda" type="button" data-det="artista" data-k="${esc(a.k)}">${imgHtml(a.s)}<b>${esc(a.s.albumArtista || a.s.artista || "Desconocido")}</b><span>${a.n} canciones</span></button>`).join(""))}`;
  $("#resumen").textContent = ""; imagenes(c);
}
function dibujarBuscar() {
  const c = $("#contenido"), q = normal(E.q.trim());
  if (!q) {
    const g = conteoGeneros();
    const tonos = (t) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
    c.innerHTML = g.size ? `<h3 class="sub">Explorar todo</h3><div class="generos">${[...g].sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button type="button" class="genero" data-det="lista" data-k="${esc("__gen:" + t)}" style="--h:${tonos(t)}">${imgHtml(E.canciones.find((s) => generosDe(s).includes(t)))}<b>${esc(t)}</b><span>${n} canciones</span></button>`).join("")}</div>` : `<div class="vacio">Escribe el nombre de una canción, un artista o un álbum.</div>`;
    return;
  }
  listaActual = ordenar(E.canciones.filter((s) => coincide(s, q)));
  const albs = [...agrupar((s) => s.alb)].filter(([, v]) => v.some((s) => coincide(s, q))).slice(0, 10);
  const cabeza = (albs.length ? `<section class="estante"><h3>Álbumes</h3><div class="carril">${albs.map(([k, v]) => `<button class="tarjeta" type="button" data-det="album" data-k="${esc(k)}">${imgHtml(v[0])}<b>${esc(v[0].album || "Sin álbum")}</b><span>${esc(v[0].albumArtista || v[0].artista || "")}</span></button>`).join("")}</div></section>` : "") +
    (listaActual.length ? `<h3 class="sub">Canciones</h3>` : `<div class="vacio">Nada coincide con “${esc(E.q)}”.</div>`);
  pintar(c, listaActual, (s, i) => filaCancion(s, i), (h) => cabeza + `<ul class="lista" data-tandas>${h}</ul>`);
}
// barra de letras A–Z para saltar rápido en listas largas
function montarIndice(items, texto) {
  const ind = $("#indice"), c = $("#contenido");
  const letra = (t) => { const ch = normal(String(t || "").trim()).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; };
  if (items.length < 25) { ind.hidden = true; return; }
  const primero = new Map(); items.forEach((x, i) => { const l = letra(texto(x)); if (!primero.has(l)) primero.set(l, i); });
  const letras = [...primero.keys()].sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));
  ind.innerHTML = letras.map((l) => `<span>${l}</span>`).join(""); ind.hidden = false;
  const bur = $("#burbuja"); let ultima = "";
  const ir = (y) => {
    const r = ind.getBoundingClientRect(), k = Math.max(0, Math.min(letras.length - 1, Math.floor(((y - r.top) / r.height) * letras.length))), l = letras[k];
    if (l === ultima) return; ultima = l; bur.textContent = l; bur.hidden = false; vibra(8);
    forzarPintado(); const cont = c.querySelector("[data-tandas]"), el = cont && cont.children[primero.get(l)]; if (el) el.scrollIntoView({ block: "start" });
  };
  ind.onpointerdown = (e) => { ind.setPointerCapture(e.pointerId); ind.classList.add("tocando"); ultima = ""; ir(e.clientY); e.preventDefault(); };
  ind.onpointermove = (e) => { if (ind.classList.contains("tocando")) ir(e.clientY); };
  const fin = () => { ind.classList.remove("tocando"); bur.hidden = true; };
  ind.onpointerup = fin; ind.onpointercancel = fin;
}
function dibujarBiblioteca() {
  const c = $("#contenido"), q = normal(E.q.trim()), d = E.detalle;
  $("#barra-orden").hidden = !(E.tab === "canciones" && !d);
  document.querySelectorAll("#pestanas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === E.tab)));
  if (!E.canciones.length) { c.innerHTML = vacio(); $("#resumen").textContent = ""; return; }
  if (d) return dibujarDetalle(c, d);
  if (E.tab === "canciones") {
    listaActual = q ? ordenadas().filter((s) => coincide(s, q)) : ordenadas();
    const dur = listaActual.reduce((a, s) => a + (s.duracion || 0), 0);
    $("#resumen").textContent = `${listaActual.length} canciones · ${fmt(dur)}`;
    pintar(c, listaActual, (s, i) => filaCancion(s, i), (h) => `<ul class="lista" data-tandas>${h}</ul>`);
    if (!listaActual.length) c.innerHTML = `<div class="vacio">Nada coincide con “${esc(E.q)}”.</div>`;
    const base = { titulo: (s) => s.titulo || s.nombre, artista: (s) => s.artista, album: (s) => s.album }[E.orden]; if (base) montarIndice(listaActual, base);
  } else if (E.tab === "albumes") {
    const g = [...agrupar((s) => s.alb)].filter(([, v]) => v.some((s) => coincide(s, q))).sort((a, b) => colador.compare(a[1][0].album, b[1][0].album));
    pintar(c, g, ([k, v]) => `<button class="tarjeta" type="button" data-det="album" data-k="${esc(k)}">${imgHtml(v[0])}<b>${esc(v[0].album || "Sin álbum")}</b><span>${esc(v[0].albumArtista || v[0].artista || "")} · ${v.length}</span></button>`, (h) => `<div class="acciones-detalle"><button class="boton" type="button" data-portadas>Descargar carátulas que faltan</button></div><div class="rejilla" data-tandas>${h}</div>`); montarIndice(g, ([, v]) => v[0].album);
  } else if (E.tab === "artistas") {
    const g = [...agrupar((s) => normal(s.albumArtista || s.artista))].filter(([, v]) => v.some((s) => coincide(s, q))).sort((a, b) => colador.compare(a[1][0].albumArtista || a[1][0].artista, b[1][0].albumArtista || b[1][0].artista));
    pintar(c, g, ([k, v]) => `<button class="tarjeta" type="button" data-det="artista" data-k="${esc(k)}">${imgHtml(v[0])}<b>${esc(v[0].albumArtista || v[0].artista || "Desconocido")}</b><span>${v.length} canciones</span></button>`, (h) => `<div class="rejilla" data-tandas>${h}</div>`); montarIndice(g, ([, v]) => v[0].albumArtista || v[0].artista);
  } else if (E.tab === "carpetas") {
    const g = [...agrupar((s) => s.carpeta || "")].sort((a, b) => colador.compare(a[0], b[0]));
    pintar(c, g, ([k, v]) => `<button class="tarjeta" type="button" data-det="carpeta" data-k="${esc(k)}">${imgHtml(v[0])}<b>${esc(nombreCarpeta(k))}</b><span>${v.length} canciones</span></button>`, (h) => `<div class="rejilla" data-tandas>${h}</div>`);
  } else {
    const fav = E.canciones.filter((s) => s.fav);
    const filas = [`<button class="tarjeta" type="button" data-det="lista" data-k="__fav"><span class="sinport" style="display:grid;place-items:center;color:var(--ac2)">${I.fav.replace("<svg", '<svg width="56" height="56" fill="currentColor"')}</span><b>Favoritas</b><span>${fav.length} canciones</span></button>`];
    for (const l of E.listas) filas.push(`<button class="tarjeta" type="button" data-det="lista" data-k="${esc(l.id)}"><span class="sinport" style="display:grid;place-items:center;color:var(--tx2)">${I.lista.replace("<svg", '<svg width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5"')}</span><b>${esc(l.nombre)}</b><span>${l.ids.length} canciones</span></button>`);
    c.innerHTML = `<div class="acciones-detalle"><button class="boton" type="button" data-nueva-lista>Nueva lista</button></div><div class="rejilla">${filas.join("")}</div>`;
    $("#resumen").textContent = "";
  }
  imagenes(c);
}
const nombreCarpeta = (k) => { const t = String(k || "").replace(/\/+$/, "").split("/"); return t[t.length - 1] || "Raíz"; };
function cancionesDe(d) {
  if (d.tipo === "carpeta") return E.canciones.filter((s) => (s.carpeta || "") === d.k).sort((a, b) => (a.disco - b.disco) || (a.pista - b.pista) || colador.compare(a.titulo || a.nombre, b.titulo || b.nombre));
  if (d.tipo === "album") return ordenar(E.canciones.filter((s) => s.alb === d.k)).sort((a, b) => (a.disco - b.disco) || (a.pista - b.pista) || colador.compare(a.titulo, b.titulo));
  if (d.tipo === "artista") return E.canciones.filter((s) => normal(s.albumArtista || s.artista) === d.k).sort((a, b) => colador.compare(a.album, b.album) || (a.disco - b.disco) || (a.pista - b.pista));
  if (d.k === "__fav") return E.canciones.filter((s) => s.fav);
  if (d.k === "__mas") return masEscuchadas();
  if (d.k === "__ult") return ultimasEscuchadas();
  if (d.k === "__olv") return sinEscuchar();
  if (d.k.startsWith("__gen:")) { const g = d.k.slice(6); return E.canciones.filter((s) => generosDe(s).includes(g)); }
  const l = E.listas.find((x) => x.id === d.k); return l ? l.ids.map((id) => porId.get(id)).filter(Boolean) : [];
}
function dibujarDetalle(c, d) {
  listaActual = cancionesDe(d);
  const l = d.tipo === "lista" && !d.k.startsWith("__") ? E.listas.find((x) => x.id === d.k) : null;
  const titulo = d.tipo === "carpeta" ? nombreCarpeta(d.k) : d.tipo === "album" ? (listaActual[0]?.album || "Álbum") : d.tipo === "artista" ? (listaActual[0]?.albumArtista || listaActual[0]?.artista || "Artista") : l ? l.nombre : ({ __fav: "Favoritas", __mas: "Más escuchadas", __ult: "Escuchadas hace poco", __olv: "Para redescubrir" }[d.k] || (d.k.startsWith("__gen:") ? "Mix " + d.k.slice(6) : "Favoritas"));
  $("#resumen").textContent = "";
  c.innerHTML = `<div class="cabecera-detalle"><button class="ib" type="button" data-volver aria-label="Volver">${I.volver}</button><h2>${esc(titulo)}</h2>${l ? `<button class="ib" type="button" data-borrar-lista aria-label="Borrar lista">${I.mas3}</button>` : ""}</div>
  <div class="acciones-detalle"><button class="boton primario" type="button" data-tocar-todo>Reproducir</button><button class="boton" type="button" data-tocar-azar>Aleatorio</button>${d.tipo === "album" ? `<button class="boton" type="button" data-portada-album>Buscar carátula</button>` : ""}</div>
  <div id="det-lista"></div>`;
  const cont = $("#det-lista");
  if (listaActual.length) pintar(cont, listaActual, (s, i) => filaCancion(s, i, d.tipo === "album" ? "" : ` · ${esc(s.album || "")}`), (h) => `<ul class="lista" data-tandas>${h}</ul>`); else cont.innerHTML = `<div class="vacio">Aquí no hay canciones todavía.</div>`;
  imagenes(c);
}

// ── reproducir ──
async function tocar(lista, i, azar = false) {
  if (!lista.length) return;
  reproductor.ponerAleatorio(azar); $("#r-azar").setAttribute("aria-pressed", String(azar));
  await reproductor.cargarCola(lista, azar ? Math.floor(Math.random() * lista.length) : i, true);
  guardarSesion();
}
let ultimoId = null, dirCambio = 1;
function animar(el, clase, ms = 1000) { el.classList.remove(clase); void el.offsetWidth; el.classList.add(clase); clearTimeout(el["_" + clase]); el["_" + clase] = setTimeout(() => el.classList.remove(clase), ms); }
function actualizarMini() {
  const s = reproductor.actual; $("#mini").hidden = !s;
  document.body.style.paddingBottom = "";
  if (!s) return;
  $("#mini-titulo").textContent = s.titulo || s.nombre; $("#mini-artista").textContent = s.artista || "";
  const nueva = s.id !== ultimoId, primera = ultimoId === null; ultimoId = s.id;
  portadaUrl(s.alb).then((u) => {
    $("#mini-port").src = u || SIN; $("#r-port").src = u || SIN; tinte(s.alb, u);
    if (MOTOR && !u && nueva && E.aj.auto !== false && !intentadasSesion.has(s.alb)) { intentadasSesion.add(s.alb); portadaWeb(s, true).catch(() => {}); }
    if (nueva && !primera) { const g = $(".portada-grande"); g.style.setProperty("--dir", dirCambio); animar(g, "voltea", 900); animar(g, "brilla", 1100); animar($("#mini-port"), "pop", 700); dirCambio = 1; }
  });
  $("#r-titulo").textContent = s.titulo || s.nombre; $("#r-artista").textContent = s.artista || "Artista desconocido"; $("#r-album").textContent = [s.album, s.anio].filter(Boolean).join(" · ");
  const chips = [(s.bits >= 24 || s.sampleRate > 48000) && s.formato !== "MP3" && s.formato !== "AAC" ? "Hi-Res" : "", s.formato, s.bitrate && s.formato !== "FLAC" ? `${s.bitrate} kbps` : "", s.sampleRate ? `${+(s.sampleRate / 1000).toFixed(1)} kHz` : "", s.bits ? `${s.bits} bits` : "", s.canales === 1 ? "Mono" : s.canales === 2 ? "Estéreo" : s.canales ? `${s.canales} canales` : ""].filter(Boolean);
  $("#r-chips").innerHTML = chips.map((t) => `<span class="chip${t === "Hi-Res" ? " activo" : ""}">${esc(t)}</span>`).join("");
  const f = $("#r-fav"); f.setAttribute("aria-pressed", String(!!s.fav)); f.firstElementChild.style.fill = s.fav ? "currentColor" : "none"; f.style.color = s.fav ? "var(--ac2)" : "";
  document.title = `${s.titulo || s.nombre} · Onda`;
  document.querySelectorAll(".fila.sonando").forEach((el) => el.classList.remove("sonando"));
  document.querySelectorAll(`.fila[data-id="${CSS.escape(s.id)}"]`).forEach((el) => el.classList.add("sonando"));
  actualizarTiempo();
}
function actualizarEstado() {
  const p = reproductor.sonando; $(".portada-grande").classList.toggle("pausada", !p);
  { const b = $("#r-barra-c"); b.classList.toggle("suena", p); b.classList.toggle("pausada", !p); } bucleBarra();
  $("#mini-play").innerHTML = p ? I.pausa : I.play; $("#r-play").innerHTML = p ? I.pausa : I.play;
}
const tintes = new Map();
async function extraerColor(url) {
  let r = { col: "#3a3f7a", ac: "#c9d0ff" };
  if (!url) return r;
  try {
    const im = new Image(); im.src = url; await im.decode(); const c = document.createElement("canvas"); c.width = c.height = 12; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 12, 12);
    const d = g.getImageData(0, 0, 12, 12).data; let R = 0, G = 0, B = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sat = (mx - mn) / (mx || 1), k = 0.05 + sat * sat; R += d[i] * k; G += d[i + 1] * k; B += d[i + 2] * k; w += k; }
    R /= w; G /= w; B /= w; const m = Math.max(R, G, B) || 1, f = 150 / m;                       // brillo medio: el vidrio se ve mejor
    r.col = `rgb(${Math.round(Math.min(255, R * f))},${Math.round(Math.min(255, G * f))},${Math.round(Math.min(255, B * f))})`;
    // color de acento: mismo tono pero vivo y claro, para que se lea sobre fondo oscuro
    const mx = Math.max(R, G, B) / 255, mn = Math.min(R, G, B) / 255, dl = mx - mn; let h = 0;
    if (dl) { h = mx === R / 255 ? ((G - B) / 255 / dl) % 6 : mx === G / 255 ? (B - R) / 255 / dl + 2 : (R - G) / 255 / dl + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
    const sat = Math.min(0.95, Math.max(0.55, (mx ? dl / mx : 0) * 1.25));
    r.ac = `hsl(${h} ${Math.round(sat * 100)}% 72%)`;
  } catch (_) { /* sin color */ }
  return r;
}
let ultimaTinta = null, ultimaPortada = null, fondoUsuario = null;
function aplicarColores() {
  const r = document.documentElement, a = E.aj, t = (a.fondo === "imagen" && fondoUsuario?.tinta) || ultimaTinta;
  if (t) r.style.setProperty("--t", t.col);
  const ac = a.acento ?? "auto";
  if (ac === "auto" && t) { r.style.setProperty("--ac2", t.ac); r.style.setProperty("--sw", t.ac); }
  else if (ac && ac !== "auto") { r.style.setProperty("--ac2", ac); r.style.setProperty("--sw", ac); }
  else { r.style.removeProperty("--ac2"); r.style.removeProperty("--sw"); }
  const f = a.fondo || "degradado"; r.dataset.fondo = f;
  const u = f === "portada" ? ultimaPortada : f === "imagen" ? fondoUsuario?.url : null;
  r.style.setProperty("--fondo-img", u ? `url("${u}")` : "none");
}
async function tinte(alb, url) {
  let col = tintes.get(alb);
  if (!col) { col = await extraerColor(url); tintes.set(alb, col); }
  ultimaTinta = col; ultimaPortada = url || null; aplicarColores();
}
async function elegirFondo(archivo) {
  const url = URL.createObjectURL(archivo); const tinta = await extraerColor(url);
  if (fondoUsuario?.url) URL.revokeObjectURL(fondoUsuario.url);
  fondoUsuario = { url, tinta }; await db.poner("ajustes", archivo, "fondoImg").catch(() => {});
  E.aj.fondo = "imagen"; $("#aj-fondo").value = "imagen"; aplicarAvanzados(); guardarAjustes();
}
async function cargarFondoUsuario() {
  const b = await db.traer("ajustes", "fondoImg").catch(() => null); if (!b) return;
  const url = URL.createObjectURL(b); fondoUsuario = { url, tinta: await extraerColor(url) }; aplicarColores();
}
let arrastrando = false;
// la barra avanza fluida entre un aviso del motor y el siguiente (solo mientras suena y la app está a la vista)
let ancla = { t: 0, at: 0 }, rafBarra = 0, segPintado = -1;
function pintarBarra(t, d) {
  const p = d ? Math.min(100, (t / d) * 100) : 0;
  $("#mini-prog").style.transform = `scaleX(${p / 100})`;
  if (!arrastrando) { const b = $("#r-barra"); b.style.setProperty("--p", p + "%"); b.value = Math.round(p * 10); const sg = Math.floor(t); if (sg !== segPintado) { segPintado = sg; $("#r-t1").textContent = fmt(t); } }
}
function bucleBarra() {
  if (rafBarra) return;
  const paso = () => {
    if (!reproductor.sonando || document.hidden) { rafBarra = 0; return; }
    if (!arrastrando) { const d = reproductor.duracion; pintarBarra(Math.min(d || 0, ancla.t + ((performance.now() - ancla.at) / 1000) * (reproductor.velocidad || 1)), d); }
    rafBarra = requestAnimationFrame(paso);
  };
  rafBarra = requestAnimationFrame(paso);
}
function actualizarTiempo() {
  const t = reproductor.tiempo, d = reproductor.duracion, est = ancla.t + ((performance.now() - ancla.at) / 1000) * (reproductor.velocidad || 1);
  if (!reproductor.sonando || Math.abs(est - t) > 0.5) ancla = { t, at: performance.now() };          // se corrige solo si se desvió o hubo un salto
  if (!reproductor.sonando) pintarBarra(t, d); else bucleBarra();
  $("#r-t2").textContent = fmt(d);
}

// ── sesión y ajustes guardados ──
async function guardarAjustes() { await db.poner("ajustes", { orden: E.orden, bandas: reproductor.bandasDb, pre: reproductor.preampDb, esp: MOTOR ? { a: reproductor.ancho, e: reproductor.env, g: reproductor.graves } : undefined, rg: reproductor.rgModo, eq: reproductor.eqOn, vel: reproductor.velocidad, viz: !!E.aj.viz, auto: E.aj.auto !== false, salida: E.aj.salida || null, av: { silencio: !!E.aj.silencio, ruido: E.aj.ruido !== false, enfoque: E.aj.enfoque !== false, sistema: E.aj.sistema !== false, minSeg: E.aj.minSeg || "0", acento: E.aj.acento ?? "auto", fondo: E.aj.fondo || "degradado", letraTam: E.aj.letraTam || "1", plano: !!E.aj.plano, vib: E.aj.vib !== false, chips: E.aj.chips !== false } }, "config").catch(() => {}); }
let tSes = 0;
async function guardarSesion(fuerza) {
  const ahora = Date.now(); if (!fuerza && ahora - tSes < 4000) return; tSes = ahora;
  const s = reproductor.actual; if (!s) return;
  await db.poner("ajustes", { ids: reproductor.listaEnOrden().map((x) => x.id), pos: reproductor.pos, t: reproductor.tiempo, azar: reproductor.aleatorio, rep: reproductor.repetir }, "sesion").catch(() => {});
}

// ── historial de reproducción ──
let HIST = { m: {}, d: {}, tot: 0 };
const claveC = (s) => normal((s.artista || "") + "|" + (s.titulo || s.nombre || ""));
let _pc = { v: -1, m: new Map() };
function porClave() { if (_pc.v !== E.version) { _pc = { v: E.version, m: new Map(E.canciones.map((s) => [claveC(s), s])) }; } return _pc.m; }
const diaDe = (off = 0) => { const d = new Date(Date.now() - off * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let ultimoT = -1, deEsta = 0, contada = false, tGuardaH = 0;
function contarTiempo() {
  const s = reproductor.actual; if (!s) return; const t = reproductor.tiempo, d = t - ultimoT; ultimoT = t;
  if (!reproductor.sonando || !(d > 0 && d < 2.5)) return;
  const k = claveC(s), e = (HIST.m[k] ||= { n: 0, u: 0, ms: 0 }), ms = d * 1000, dia = diaDe();
  e.ms += ms; HIST.tot += ms; HIST.d[dia] = (HIST.d[dia] || 0) + ms; deEsta += ms;
  if (!contada && deEsta >= Math.min(30000, (reproductor.duracion || 60) * 500)) { contada = true; e.n++; e.u = Date.now(); }
  if (Date.now() - tGuardaH > 20000) guardarHist();
}
function guardarHist() { tGuardaH = Date.now(); db.poner("ajustes", HIST, "hist").catch(() => {}); }
function reiniciarConteo() { ultimoT = -1; deEsta = 0; contada = false; }
const masEscuchadas = () => { const m = porClave(); return Object.entries(HIST.m).filter(([k, e]) => e.n > 0 && m.has(k)).sort((a, b) => b[1].n - a[1].n || b[1].ms - a[1].ms).map(([k]) => m.get(k)); };
const ultimasEscuchadas = () => { const m = porClave(); return Object.entries(HIST.m).filter(([k, e]) => e.u > 0 && m.has(k)).sort((a, b) => b[1].u - a[1].u).map(([k]) => m.get(k)); };
const sinEscuchar = () => E.canciones.filter((s) => !(HIST.m[claveC(s)]?.n > 0));
const tiempoLargo = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
function abrirStats() {
  const dias = [...Array(7)].map((_, i) => 6 - i).map((o) => ({ ms: HIST.d[diaDe(o)] || 0, l: "DLMXJVS"[new Date(Date.now() - o * 864e5).getDay()] }));
  const max = Math.max(1, ...dias.map((x) => x.ms)), sem = dias.reduce((a, x) => a + x.ms, 0), reps = Object.values(HIST.m).reduce((a, e) => a + e.n, 0);
  const m = porClave(), art = new Map(); for (const [k, e] of Object.entries(HIST.m)) { const s = m.get(k); if (s) { const a = s.albumArtista || s.artista || "Desconocido"; art.set(a, (art.get(a) || 0) + e.ms); } }
  const topA = [...art].sort((a, b) => b[1] - a[1]).slice(0, 5), topC = masEscuchadas().slice(0, 5);
  $("#stats-cuerpo").innerHTML = reps || HIST.tot ? `<div class="nums"><div class="num"><b>${tiempoLargo(HIST.d[diaDe()] || 0)}</b><span>Hoy</span></div><div class="num"><b>${tiempoLargo(sem)}</b><span>Últimos 7 días</span></div><div class="num"><b>${tiempoLargo(HIST.tot)}</b><span>Total escuchado</span></div><div class="num"><b>${reps}</b><span>Reproducciones</span></div></div>
    <h3 class="sub">Esta semana</h3><div class="barras">${dias.map((x) => `<div><i style="height:${Math.round((x.ms / max) * 100)}%"></i>${x.l}</div>`).join("")}</div>
    ${topA.length ? `<h3 class="sub">Artistas que más escuchas</h3><ol>${topA.map(([a, ms]) => `<li><span>${esc(a)}</span><span>${tiempoLargo(ms)}</span></li>`).join("")}</ol>` : ""}
    ${topC.length ? `<h3 class="sub">Canciones favoritas del momento</h3><ol>${topC.map((s) => `<li><span>${esc(s.titulo || s.nombre)}</span><span>${HIST.m[claveC(s)].n}×</span></li>`).join("")}</ol>` : ""}` : `<div class="vacio">Todavía no hay actividad. Escucha música y aquí aparecerá tu tiempo, tus artistas y tus canciones más repetidas.</div>`;
  abrir("hoja-stats");
}

// ── copia de seguridad ──
async function guardarCopia() {
  const cfg = await db.traer("ajustes", "config").catch(() => null);
  const claves = (ids) => ids.map((id) => porId.get(id)).filter(Boolean).map(claveC);
  const datos = { app: "onda", v: 1, fecha: new Date().toISOString(), fav: E.canciones.filter((s) => s.fav).map(claveC), listas: E.listas.map((l) => ({ nombre: l.nombre, claves: claves(l.ids) })), hist: HIST, cfg: cfg ? { orden: cfg.orden, av: cfg.av, vel: cfg.vel, rg: cfg.rg, bandas: cfg.bandas, pre: cfg.pre, eq: cfg.eq, esp: cfg.esp, auto: cfg.auto } : null };
  const nombre = `onda-copia-${diaDe()}.json`, texto = JSON.stringify(datos);
  try {
    if (MOTOR) { const r = await MOTOR.guardarArchivo({ nombre, texto }); avisar(`Copia guardada en ${r.ruta}`, 5000); }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); avisar("Copia descargada"); }
  } catch (e) { avisar("No pude guardar la copia: " + (e?.message || e)); }
}
async function restaurarCopia(archivo) {
  try {
    const d = JSON.parse(await archivo.text()); if (d.app !== "onda") throw new Error("este archivo no es una copia de Onda");
    const m = porClave(); let favs = 0, listas = 0;
    for (const k of d.fav || []) { const s = m.get(k); if (s && !s.fav) { s.fav = true; await db.poner("canciones", s); favs++; } }
    for (const l of d.listas || []) {
      const ids = (l.claves || []).map((k) => m.get(k)?.id).filter(Boolean); if (!ids.length) continue;
      let x = E.listas.find((y) => y.nombre === l.nombre);
      if (!x) { x = { id: "l" + Date.now().toString(36) + listas, nombre: l.nombre, ids: [] }; E.listas.push(x); listas++; }
      for (const id of ids) if (!x.ids.includes(id)) x.ids.push(id); await db.poner("listas", x);
    }
    const h = d.hist || {}; for (const [k, e] of Object.entries(h.m || {})) { const a = (HIST.m[k] ||= { n: 0, u: 0, ms: 0 }); a.n = Math.max(a.n, e.n || 0); a.u = Math.max(a.u, e.u || 0); a.ms = Math.max(a.ms, e.ms || 0); }
    for (const [k, v] of Object.entries(h.d || {})) HIST.d[k] = Math.max(HIST.d[k] || 0, v); HIST.tot = Math.max(HIST.tot, h.tot || 0); guardarHist();
    if (d.cfg) { const act = (await db.traer("ajustes", "config").catch(() => null)) || {}; await db.poner("ajustes", { ...act, ...d.cfg }, "config"); }
    dibujar(); avisar(`Copia restaurada: ${favs} favoritas, ${listas} listas nuevas. Los ajustes se aplican al reiniciar Onda.`, 6000);
  } catch (e) { avisar("No pude restaurar: " + (e?.message || e)); }
}

// ── ajustes avanzados ──
const TOGGLES = [["aj-silencio", "silencio", false], ["aj-ruido", "ruido", true], ["aj-enfoque", "enfoque", true], ["aj-sistema", "sistema", true], ["aj-plano", "plano", false], ["aj-vib", "vib", true], ["aj-chips", "chips", true]];
const SELECTS = [["aj-min", "minSeg", "0"], ["aj-acento", "acento", "auto"], ["aj-fondo", "fondo", "degradado"], ["aj-letra", "letraTam", "1"]];
let tocadoEnfoque = false;
function sincronizarAjustes() {
  for (const [id, clave, def] of TOGGLES) $("#" + id).checked = E.aj[clave] === undefined ? def : !!E.aj[clave];
  for (const [id, clave, def] of SELECTS) $("#" + id).value = E.aj[clave] ?? def;
  aplicarAvanzados();
}
function aplicarAvanzados() {
  const r = document.documentElement, a = E.aj;
  r.classList.toggle("plano", !!a.plano); r.classList.toggle("sinchips", a.chips === false); window.__vibrar = a.vib !== false;
  aplicarColores(); $("#aj-fondo-img").hidden = a.fondo !== "imagen";
  r.style.setProperty("--lt", a.letraTam || "1");
  if (MOTOR && reproductor) { const o = { silencio: !!a.silencio, ruido: a.ruido !== false }; if (tocadoEnfoque || a.enfoque === false) o.enfoque = a.enfoque !== false; reproductor.ponerAvanzado(o).catch(() => {}); }
}

// ── hojas ──
const pila = []; let ignorarPop = 0;
function abrir(id) {
  const h = $("#" + id); clearTimeout(h._t); h.hidden = false; void h.offsetWidth; h.classList.add("ver"); pila.push(id);
  if (h.classList.contains("corta")) $("#fondo").hidden = false; history.pushState({ hoja: id }, ""); h.focus?.();
}
function cerrar(id, desdeHistorial) {
  const k = pila.lastIndexOf(id); if (k < 0) return; pila.splice(k, 1); { const h = $("#" + id); h.classList.remove("ver"); clearTimeout(h._t); h._t = setTimeout(() => { h.hidden = true; }, 420); }
  if (!pila.some((x) => $("#" + x).classList.contains("corta"))) $("#fondo").hidden = true;
  if (!desdeHistorial) { ignorarPop++; history.back(); }
  if (id === "hoja-rep") vizApagar();
}
let salirListo = false;
// atrás: cierra lo abierto, vuelve a Inicio y, en Inicio, pide un segundo gesto para salir
function atras(porHistorial) {
  if (pila.length) { cerrar(pila[pila.length - 1], porHistorial); return; }
  if (E.detalle) { E.detalle = null; dibujar(); return; }
  if (E.vista !== "inicio") { E.vista = "inicio"; dibujar(); animarCambio(); window.scrollTo(0, 0); if (porHistorial) history.pushState({ s: 1 }, ""); return; }
  if (!salirListo) { salirListo = true; avisar("Desliza otra vez para salir", 2000); setTimeout(() => { salirListo = false; if (porHistorial) history.pushState({ s: 1 }, ""); }, 2000); return; }
  if (!porHistorial) { const A = plug("App"); (A?.minimizeApp || A?.exitApp)?.call(A); }              // la música sigue sonando
}
window.addEventListener("popstate", () => { if (ignorarPop > 0) { ignorarPop--; return; } atras(true); });
{ const A = plug("App"); if (A?.addListener) A.addListener("backButton", () => atras(false)); }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-cerrar]"); if (b) cerrar(b.closest(".hoja").id); });
$("#fondo").addEventListener("click", () => { for (let i = pila.length - 1; i >= 0; i--) if ($("#" + pila[i]).classList.contains("corta")) { cerrar(pila[i]); break; } });

function menu(titulo, opciones) {
  $("#menu-titulo").textContent = titulo;
  const c = $("#menu-op"); c.innerHTML = "";
  for (const o of opciones) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = o.t; if (o.cls) b.className = o.cls;
    b.addEventListener("click", async () => { cerrar("hoja-menu"); await o.f(); }); c.append(b);
  }
  if (pila.includes("hoja-menu")) return; abrir("hoja-menu");
}
function agregarALista(s) {
  const op = [{ t: "Favoritas", f: async () => { await alternarFav(s, true); avisar("Agregada a favoritas."); } }];
  for (const l of E.listas) op.push({ t: l.nombre, f: async () => { if (!l.ids.includes(s.id)) { l.ids.push(s.id); await db.poner("listas", l); } avisar(`Agregada a “${l.nombre}”.`); } });
  op.push({ t: "+ Nueva lista…", f: async () => { const n = await nuevaLista(); if (n) { n.ids.push(s.id); await db.poner("listas", n); avisar(`Lista “${n.nombre}” creada.`); } } });
  menu("Agregar a una lista", op);
}
async function nuevaLista() {
  const nombre = (prompt("Nombre de la lista") || "").trim(); if (!nombre) return null;
  const l = { id: "l" + Date.now().toString(36), nombre, ids: [] }; E.listas.push(l); await db.poner("listas", l); dibujar(); return l;
}
async function alternarFav(s, forzar) {
  s.fav = forzar ?? !s.fav; await db.poner("canciones", s);
  if (reproductor.actual?.id === s.id) actualizarMini();
  if (E.tab === "listas") dibujar();
}
function opcionesCancion(s, enLista) {
  const op = [
    { t: "Reproducir a continuación", f: () => { if (!reproductor.actual) tocar([s], 0); else { reproductor.siguienteLuego(s); avisar("Sonará a continuación."); } } },
    { t: "Agregar al final de la cola", f: () => { if (!reproductor.actual) tocar([s], 0); else { reproductor.alFinal(s); avisar("Agregada a la cola."); } } },
    { t: s.fav ? "Quitar de favoritas" : "Agregar a favoritas", f: () => alternarFav(s) },
    { t: "Agregar a una lista…", f: () => setTimeout(() => agregarALista(s), 0) },
  ];
  op.push({ t: "Buscar portada en internet", f: () => portadaWeb(s) }, { t: "Elegir portada de mi galería", f: () => elegirImagen(s) }, { t: "Ver letra", f: () => { if (reproductor.actual?.id !== s.id) tocar([s], 0).then(abrirLetra); else abrirLetra(); } });
  if (enLista) op.push({ t: "Quitar de esta lista", f: async () => { enLista.ids = enLista.ids.filter((x) => x !== s.id); await db.poner("listas", enLista); dibujar(); } });
  if (!MOTOR) op.push({ t: "Borrar de la biblioteca", cls: "peligro", f: async () => { if (!confirm(`¿Borrar “${s.titulo || s.nombre}” de la app? El archivo original de tu teléfono no se toca.`)) return; await borrarCancion(s); } });
  menu(s.titulo || s.nombre, op);
}
async function borrarCancion(s) {
  await db.borrar("canciones", s.id); await db.borrar("archivos", s.id);
  E.canciones = E.canciones.filter((x) => x.id !== s.id); E.version++; porId.delete(s.id);
  for (const l of E.listas) if (l.ids.includes(s.id)) { l.ids = l.ids.filter((x) => x !== s.id); await db.poner("listas", l); }
  if (!E.canciones.some((x) => x.alb === s.alb)) { await db.borrar("portadas", s.alb); urlsPort.delete(s.alb); }
  dibujar(); mostrarEspacio();
}

// ── cola ──
const listaDelDetalle = () => (E.detalle?.tipo === "lista" && E.detalle.k !== "__fav" ? E.listas.find((x) => x.id === E.detalle.k) : null);
function dibujarCola() {
  const l = reproductor.listaEnOrden(), u = $("#cola-lista");
  u.innerHTML = l.map((s, i) => `<li class="fila${i === reproductor.pos ? " sonando" : ""}" data-pos="${i}">${imgHtml(s)}<span class="info"><b>${esc(s.titulo || s.nombre)}</b><span>${esc(s.artista || "")}</span></span>${i === reproductor.pos ? "" : `<button class="mas" type="button" data-sube="${i}" aria-label="Subir">▲</button><button class="mas" type="button" data-baja="${i}" aria-label="Bajar">▼</button><button class="mas" type="button" data-quita="${i}" aria-label="Quitar">✕</button>`}</li>`).join("");
  imagenes(u);
}

// ── ecualizador ──
function armarEq() {
  const nom = (f) => (f >= 1000 ? f / 1000 + "k" : f);
  $("#eq-bandas").innerHTML = BANDAS.map((f, i) => `<div class="banda"><span id="eq-v${i}">0</span><input type="range" min="-12" max="12" step="0.5" value="0" data-b="${i}" aria-label="${f} Hz"><span>${nom(f)}</span></div>`).join("");
  $("#eq-presets").innerHTML = Object.keys(PRESETS).map((n) => `<button class="chip" type="button" data-preset="${esc(n)}">${esc(n)}</button>`).join("");
}
function mostrarEspacial() {
  const R = reproductor; $("#espacial").hidden = !MOTOR; if (!MOTOR) return;
  $("#esp-ancho").value = R.ancho; $("#esp-ancho-v").textContent = R.ancho + "%"; $("#esp-env").value = R.env; $("#esp-env-v").textContent = R.env + "%"; $("#esp-gra").value = R.graves; $("#esp-gra-v").textContent = R.graves + "%";
  R.capacidades().then((c) => { $("#esp-env-c").hidden = !c.envolvente; $("#esp-gra-c").hidden = !c.graves; }).catch(() => {});
}
function mostrarEq() {
  mostrarEspacial();
  reproductor.bandasDb.forEach((v, i) => { const r = document.querySelector(`[data-b="${i}"]`); if (r) r.value = v; $("#eq-v" + i).textContent = (v > 0 ? "+" : "") + v; });
  $("#eq-on").checked = reproductor.eqOn; $("#eq-pre").value = reproductor.preampDb; $("#eq-pre-v").textContent = reproductor.preampDb + " dB";
  $("#eq-vel").value = reproductor.velocidad; $("#eq-vel-v").textContent = +reproductor.velocidad.toFixed(2) + "×";
  document.querySelectorAll("#eq-rg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === reproductor.rgModo)));
  document.querySelectorAll("[data-preset]").forEach((b) => b.classList.toggle("activo", PRESETS[b.dataset.preset].every((v, i) => v === reproductor.bandasDb[i])));
}

// ── temporizador ──
function dibujarSueno() {
  const op = [["Apagado", 0], ["15 minutos", 15], ["30 minutos", 30], ["45 minutos", 45], ["1 hora", 60], ["Al terminar esta canción", "cancion"]];
  const rest = reproductor.dormirRestante;
  $("#sueno-op").innerHTML = op.map(([t, v]) => `<button type="button" data-sueno="${v}">${t}</button>`).join("") + (rest ? `<p class="suave pequeno" style="padding:8px 12px">Se apaga en ${Math.ceil(rest / 60000)} min, bajando el volumen poco a poco.</p>` : "");
}

// ── visualizador (apagado por defecto; solo dibuja con el reproductor abierto y sonando) ──
let vizRaf = 0; const buf = new Uint8Array(128);
function vizEncender() {
  if (!E.aj.viz || vizRaf) return; const cv = $("#r-viz"); cv.hidden = false; const g = cv.getContext("2d");
  const paso = () => {
    vizRaf = requestAnimationFrame(paso); if (!reproductor.sonando || !reproductor.espectro(buf)) return;
    g.clearRect(0, 0, cv.width, cv.height); const n = 32, w = cv.width / n;
    for (let i = 0; i < n; i++) { const v = buf[i * 2] / 255, h = Math.max(2, v * cv.height); g.fillStyle = "rgba(165,176,255,0.85)"; g.fillRect(i * w + 1, cv.height - h, w - 2, h); }
  };
  paso();
}
function vizApagar() { cancelAnimationFrame(vizRaf); vizRaf = 0; $("#r-viz").hidden = true; }

const NOMBRES_SALIDA = { 2: "Parlante del teléfono", 3: "Audífonos con cable", 4: "Audífonos con cable", 8: "Bluetooth", 9: "HDMI", 11: "USB", 22: "USB", 26: "Bluetooth", 27: "Bluetooth" };
const nombreSalida = (s) => (s ? (s.tipo === 8 || s.tipo === 26 || s.tipo === 27 ? `Bluetooth${s.nombre ? " · " + s.nombre : ""}` : NOMBRES_SALIDA[s.tipo] || "Otra salida") : "Automática");
function etiquetaSalida() { $("#aj-salida").textContent = "Salida de audio de Onda: " + nombreSalida(E.aj.salida); }
async function elegirSalida() {
  let r; try { r = await reproductor.salidas(); } catch (_) { return avisar("No pude ver las salidas de audio."); }
  const op = [{ t: "Automática (la que use el teléfono)", f: () => cambiarSalida(null) }];
  for (const s of r.salidas || []) op.push({ t: nombreSalida(s), f: () => cambiarSalida({ tipo: s.tipo, nombre: s.nombre }) });
  menu("Salida de audio de Onda", op);
}
async function cambiarSalida(s) {
  E.aj.salida = s; etiquetaSalida(); guardarAjustes();
  try { const r = await reproductor.ponerSalida(s); avisar(!s ? "Salida automática" : r.activa ? "Onda suena por: " + nombreSalida(s) : "Esa salida no está conectada ahora; usaré la automática.", 3000); } catch (_) { avisar("No pude cambiar la salida."); }
}
function abrirReproductor() { if (pila.includes("hoja-rep")) return; abrir("hoja-rep"); actualizarTiempo(); vizEncender(); }
async function mostrarEspacio() {
  if (MOTOR) { const b = E.canciones.reduce((a, s) => a + (s.tam || 0), 0); $("#aj-espacio").textContent = `${E.canciones.length} canciones · ${(b / 1073741824).toFixed(2)} GB (no se copian)`; return; }
  const e = await db.espacio(), mb = (b) => (b / 1048576 >= 1024 ? (b / 1073741824).toFixed(2) + " GB" : Math.round(b / 1048576) + " MB");
  $("#aj-espacio").textContent = e.cupo ? `${mb(e.usado)} de ${mb(e.cupo)}` : mb(e.usado);
}

// ── eventos de la interfaz ──
function enlazar() {
  const R = reproductor;
  R.addEventListener("cambio", () => { reiniciarConteo(); actualizarMini(); if (pila.includes("hoja-cola")) dibujarCola(); });
  R.addEventListener("estado", () => { actualizarEstado(); guardarSesion(true); guardarHist(); });
  R.addEventListener("tiempo", () => { actualizarTiempo(); guardarSesion(); contarTiempo(); });
  R.addEventListener("duracion", (e) => { const s = porId.get(e.detail.id); if (s && Math.abs((s.duracion || 0) - e.detail.duracion) > 1) { s.duracion = e.detail.duracion; db.poner("canciones", s); } });
  R.addEventListener("cola", dibujarCola);
  R.addEventListener("detalles", () => actualizarMini());
  R.addEventListener("tiempo", () => actualizarLetra());
  R.addEventListener("cambio", () => { if (pila.includes("hoja-letra") && R.actual) cargarLetra(R.actual); });
  R.addEventListener("error", (e) => avisar(e.detail.mensaje));
  R.addEventListener("dormido", () => avisar("Temporizador: música apagada. Buenas noches."));
  R.addEventListener("sueno", () => { if (pila.includes("hoja-sueno")) dibujarSueno(); });

  $("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; E.vista = b.dataset.v; E.detalle = null; if (E.q) { E.q = ""; $("#q").value = ""; } dibujar(); animarCambio(); window.scrollTo(0, 0); if (E.vista === "buscar") $("#q").focus(); });
  $("#q").addEventListener("input", (e) => { E.q = e.target.value; dibujar(); });
  $("#b-agregar").addEventListener("click", () => (MOTOR ? iniciarNativo(true) : menu("Agregar música", [
    { t: "Elegir canciones", f: () => $("#f-audio").click() }, { t: "Elegir una carpeta completa", f: elegirCarpeta }])));
  $("#b-ajustes").addEventListener("click", () => { mostrarEspacio(); abrir("hoja-aj"); });
  for (const id of ["#f-audio", "#f-carpeta"]) $(id).addEventListener("change", (e) => { const l = [...e.target.files]; e.target.value = ""; importar(l); });
  $("#pestanas").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; E.tab = b.dataset.t; E.detalle = null; dibujar(); animarCambio(); });
  $("#orden").addEventListener("change", (e) => { E.orden = e.target.value; dibujar(); guardarAjustes(); });

  $("#contenido").addEventListener("click", async (e) => {
    if (e.target.closest("[data-agregar]")) return MOTOR ? iniciarNativo(true) : $("#b-agregar").click();
    const ir = e.target.closest("[data-ir]"); if (ir) { E.vista = "biblioteca"; E.tab = ir.dataset.ir; E.detalle = null; dibujar(); animarCambio(); return; }
    if (e.target.closest("[data-estadisticas]")) return abrirStats();
    if (e.target.closest("[data-portadas]")) return descargarFaltantes(true);
    if (e.target.closest("[data-portada-album]")) { const s0 = listaActual[0]; if (s0) portadaWeb(s0); return; }
    if (e.target.closest("[data-mezclar]")) return tocar(ordenar(E.canciones), 0, true);
    const gq = e.target.closest("[data-q]"); if (gq) { E.q = gq.dataset.q; $("#q").value = E.q; dibujar(); return; }
    const cl = e.target.closest("[data-lista]"); if (cl) return tocar(listasInicio[cl.dataset.lista], +cl.dataset.i);
    const det = e.target.closest("[data-det]"); if (det) { E.vista = "biblioteca"; E.tab = det.dataset.det === "artista" ? "artistas" : det.dataset.det === "album" ? "albumes" : det.dataset.det === "carpeta" ? "carpetas" : "listas"; E.detalle = { tipo: det.dataset.det, k: det.dataset.k }; history.pushState({ det: 1 }, ""); dibujar(); animarCambio(); $("#contenido").scrollIntoView(); return; }
    if (e.target.closest("[data-volver]")) return history.back();
    if (e.target.closest("[data-nueva-lista]")) { await nuevaLista(); return; }
    if (e.target.closest("[data-borrar-lista]")) { const l = E.listas.find((x) => x.id === E.detalle.k); if (l && confirm(`¿Borrar la lista “${l.nombre}”?`)) { await db.borrar("listas", l.id); E.listas = E.listas.filter((x) => x !== l); E.detalle = null; dibujar(); } return; }
    if (e.target.closest("[data-tocar-todo]")) return tocar(listaActual, 0);
    if (e.target.closest("[data-tocar-azar]")) return tocar(listaActual, 0, true);
    const fila = e.target.closest(".fila"); if (!fila) return;
    const s = porId.get(fila.dataset.id);
    if (e.target.closest("[data-mas]")) return opcionesCancion(s, listaDelDetalle());
    tocar(listaActual, +fila.dataset.i);
  });
  $("#contenido").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("fila")) e.target.click(); });

  $("#mini-abrir").addEventListener("click", abrirReproductor);
  $("#mini-play").addEventListener("click", () => R.alternar()); $("#r-play").addEventListener("click", () => R.alternar());
  $("#mini-sig").addEventListener("click", () => R.siguiente()); $("#r-sig").addEventListener("click", () => R.siguiente()); $("#r-ant").addEventListener("click", () => R.anterior());
  $("#r-azar").addEventListener("click", () => { R.ponerAleatorio(!R.aleatorio); $("#r-azar").setAttribute("aria-pressed", String(R.aleatorio)); });
  $("#r-rep").addEventListener("click", () => { const m = { no: "todo", todo: "uno", uno: "no" }[R.repetir]; R.ponerRepetir(m); $("#r-rep").dataset.modo = m; $("#r-rep").style.opacity = m === "no" ? "" : "1"; avisar({ no: "Sin repetir", todo: "Repetir toda la cola", uno: "Repetir esta canción" }[m], 1500); });
  $("#r-fav").addEventListener("click", () => { if (R.actual) alternarFav(R.actual); });
  $("#r-letra").addEventListener("click", abrirLetra);
  $("#letra-trad").addEventListener("click", alternarTraduccion);
  $("#letra-cuerpo").addEventListener("click", (e) => {
    if (e.target.closest("#letra-pegar")) return pegarLetra();
    if (e.target.closest("#letra-reintento")) { if (R.actual) cargarLetra(R.actual); return; }
    const p = e.target.closest("p[data-i]"); if (p && letraAct.lineas.length) R.buscar(letraAct.lineas[+p.dataset.i].t);
  });
  $("#f-imagen").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f || !imagenPara) return; const m = await miniatura(f); if (m) { await ponerPortada(imagenPara.alb, m); avisar("Portada cambiada", 1800); } else avisar("No pude leer esa imagen."); });
  $("#aj-salida").addEventListener("click", elegirSalida);
  $("#aj-portadas").addEventListener("click", () => descargarFaltantes(true));
  for (const [id, clave, def] of TOGGLES) $("#" + id).addEventListener("change", async (e) => { E.aj[clave] = e.target.checked; if (clave === "enfoque") tocadoEnfoque = true; aplicarAvanzados(); guardarAjustes(); if (clave === "sistema") { await cargarTodo(); dibujar(); } });
  for (const [id, clave] of SELECTS) $("#" + id).addEventListener("change", async (e) => { E.aj[clave] = e.target.value; aplicarAvanzados(); guardarAjustes(); if (clave === "minSeg") { await cargarTodo(); dibujar(); } });
  $("#aj-copia").addEventListener("click", guardarCopia);
  $("#aj-restaurar").addEventListener("click", () => $("#f-copia").click());
  $("#f-copia").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) restaurarCopia(f); });
  $("#aj-hist-borrar").addEventListener("click", async () => { if (!confirm("¿Borrar todo tu historial de reproducción?")) return; HIST = { m: {}, d: {}, tot: 0 }; await db.poner("ajustes", HIST, "hist"); dibujar(); avisar("Historial borrado"); });
  $("#aj-fondo").addEventListener("change", (e) => { if (e.target.value === "imagen" && !fondoUsuario) $("#f-fondo").click(); });
  $("#aj-fondo-img").addEventListener("click", () => $("#f-fondo").click());
  $("#f-fondo").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) elegirFondo(f); });
  $("#aj-reescanear").addEventListener("click", () => { cerrar("hoja-aj"); $("#b-agregar").click(); });
  $("#aj-auto").addEventListener("change", (e) => { E.aj.auto = e.target.checked; guardarAjustes(); });
  $("#r-lista").addEventListener("click", () => { if (R.actual) agregarALista(R.actual); });
  $("#r-cola").addEventListener("click", () => { dibujarCola(); abrir("hoja-cola"); });
  $("#r-eq").addEventListener("click", () => { mostrarEq(); abrir("hoja-eq"); });
  $("#r-sueno").addEventListener("click", () => { dibujarSueno(); abrir("hoja-sueno"); });
  const barra = $("#r-barra");
  const burbuja = $("#r-burbuja");
  barra.addEventListener("input", () => {
    arrastrando = true; const f = barra.value / 1000, t = f * R.duracion;
    $("#r-t1").textContent = fmt(t); barra.style.setProperty("--p", f * 100 + "%"); burbuja.textContent = fmt(t); burbuja.style.setProperty("--bx", `calc(${f * 100}% + ${(0.5 - f) * 14}px)`); burbuja.hidden = false; burbuja.classList.add("ver"); barra.classList.add("toca");
  });
  barra.addEventListener("change", () => {
    R.buscar((barra.value / 1000) * R.duracion); ancla = { t: (barra.value / 1000) * R.duracion, at: performance.now() }; arrastrando = false; segPintado = -1; vibra(6);
    burbuja.classList.remove("ver"); barra.classList.remove("toca"); barra.classList.remove("salto"); void barra.offsetWidth; barra.classList.add("salto"); bucleBarra();
  });

  $("#cola-lista").addEventListener("click", (e) => {
    const f = e.target.closest(".fila"); if (!f) return;
    const sube = e.target.closest("[data-sube]"), baja = e.target.closest("[data-baja]"), quita = e.target.closest("[data-quita]");
    if (sube) R.mover(+sube.dataset.sube, -1); else if (baja) R.mover(+baja.dataset.baja, 1); else if (quita) R.quitarDeCola(+quita.dataset.quita);
    else R.irA(R.orden[+f.dataset.pos]);
  });

  $("#eq-bandas").addEventListener("input", (e) => { const i = e.target.dataset.b; if (i == null) return; R.ajustarBanda(+i, +e.target.value); $("#eq-v" + i).textContent = (+e.target.value > 0 ? "+" : "") + e.target.value; guardarAjustes(); });
  $("#eq-presets").addEventListener("click", (e) => { const b = e.target.closest("[data-preset]"); if (!b) return; R.usarPreset(b.dataset.preset); mostrarEq(); guardarAjustes(); });
  for (const [id, campo] of [["esp-ancho", "ancho"], ["esp-env", "env"], ["esp-gra", "graves"]]) $("#" + id).addEventListener("input", (e) => { R[campo] = +e.target.value; $("#" + id + "-v").textContent = e.target.value + "%"; R.ponerEspacial?.(); guardarAjustes(); });
  $("#esp-sis").addEventListener("click", () => R.efectosSistema().catch(() => avisar("Tu teléfono no tiene un panel de efectos aparte. Busca “Calidad de sonido y efectos” o “Dolby Atmos” en los ajustes de sonido.", 6000)));
  $("#eq-on").addEventListener("change", (e) => { R.activarEq(e.target.checked); guardarAjustes(); });
  $("#eq-pre").addEventListener("input", (e) => { R.ponerPreamp(+e.target.value); $("#eq-pre-v").textContent = e.target.value + " dB"; guardarAjustes(); });
  $("#eq-vel").addEventListener("input", (e) => { R.ponerVelocidad(+e.target.value); $("#eq-vel-v").textContent = +(+e.target.value).toFixed(2) + "×"; guardarAjustes(); });
  $("#eq-rg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; R.ponerRG(b.dataset.v); mostrarEq(); guardarAjustes(); });
  $("#sueno-op").addEventListener("click", (e) => { const b = e.target.closest("[data-sueno]"); if (!b) return; const v = b.dataset.sueno; R.dormir(v === "cancion" ? v : +v); cerrar("hoja-sueno"); avisar(v === "0" ? "Temporizador apagado." : "Temporizador activado.", 2000); });

  $("#aj-viz").addEventListener("change", (e) => { E.aj.viz = e.target.checked; guardarAjustes(); if (!E.aj.viz) vizApagar(); });
  $("#aj-persistir").addEventListener("click", async () => avisar((await db.pedirPersistencia()) ? "Listo: el teléfono cuidará tu música." : "El teléfono no lo concedió todavía. Se concede más fácil si instalas la app.", 4000));
  $("#aj-borrar").addEventListener("click", async () => {
    if (!confirm("¿Borrar toda la biblioteca de la app? Tus archivos originales no se tocan.")) return;
    R.pausa(); for (const a of ["canciones", "archivos", "portadas", "listas"]) await db.vaciar(a);
    E.canciones = []; E.listas = []; porId.clear(); urlsPort.clear(); E.detalle = null; $("#mini").hidden = true; cerrar("hoja-aj"); dibujar(); mostrarEspacio();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { guardarSesion(true); guardarHist(); } else { autoPortadas(); bucleBarra(); reproductor.resincronizar?.(); if (MOTOR && E.aj.salida) reproductor.ponerSalida(E.aj.salida).catch(() => {}); } });
  gestos();
}
function gestos() {
  const R = reproductor;
  // hojas: arrastrar hacia abajo desde la parte de arriba para cerrar
  document.querySelectorAll(".hoja").forEach((h) => arrastrarHoja(h, h.classList.contains("completa") ? [".hoja-top", ".portada-grande", ".datos", ".chips"] : [".hoja-top"], cerrar));
  // portada del reproductor: deslizar a los lados cambia de canción
  const por = $(".portada-grande");
  deslizar(por, {
    acepta: (eje) => eje === "x",
    empezar: () => { por.style.transition = "none"; por.firstElementChild.style.transition = "none"; por.classList.add("arrastra"); },
    mover: (dx) => { por.style.translate = `${dx * 0.7}px 0`; por.style.rotate = `${dx / 40}deg`; por.firstElementChild.style.transform = `perspective(800px) rotateY(${Math.max(-35, Math.min(35, dx / 6))}deg)`; por.style.setProperty("--gx", dx * 1.4); },
    soltar: (dx, dy, vx) => {
      por.style.transition = ""; por.style.translate = ""; por.style.rotate = ""; reposoPortada();
      if (dx < -70 || vx < -0.6) { vibra(); dirCambio = 1; R.siguiente(); } else if (dx > 70 || vx > 0.6) { vibra(); dirCambio = -1; R.anterior(); }
    },
    cancelar: () => { por.style.transition = ""; por.style.translate = ""; por.style.rotate = ""; reposoPortada(); },
  });
  const reposoPortada = () => { por.classList.remove("arrastra"); por.firstElementChild.style.transition = ""; por.firstElementChild.style.transform = ""; por.style.removeProperty("--gx"); };
  por.addEventListener("click", () => { vibra(6); animar(por, "pulso", 600); animar(por, "brilla", 1100); });
  // mini reproductor: a los lados cambia de canción, hacia arriba abre el reproductor
  const mini = $("#mini"), info = $("#mini-info") || $(".mini-info");
  deslizar(mini, {
    acepta: () => true,
    empezar: () => { mini.style.transition = "none"; info.style.transition = "none"; },
    mover: (dx, dy, eje) => { if (eje === "x") info.style.translate = `${dx * 0.6}px 0`; else if (dy < 0) mini.style.translate = `0 ${dy * 0.5}px`; },
    soltar: (dx, dy, vx, vy, eje) => {
      mini.style.transition = ""; info.style.transition = ""; info.style.translate = ""; mini.style.translate = "";
      if (eje === "x") { if (dx < -70 || vx < -0.6) { vibra(); R.siguiente(); } else if (dx > 70 || vx > 0.6) { vibra(); R.anterior(); } }
      else if (dy < -40 || vy < -0.5) abrirReproductor();
    },
    cancelar: () => { mini.style.transition = ""; info.style.transition = ""; info.style.translate = ""; mini.style.translate = ""; },
  });
  // filas de canciones: derecha = suena a continuación, izquierda = favorita
  const filas = (cont, selector, alIzq, alDer) => deslizar(cont, {
    puede: (e) => e.target.closest(selector),
    acepta: (eje) => eje === "x",
    empezar: (eje, f) => { f.dataset.arr = "1"; },
    mover: (dx, dy, eje, f) => { f.style.translate = `${Math.max(-150, Math.min(150, dx))}px 0`; f.dataset.sw = dx > 50 && alDer ? "d" : dx < -50 && alIzq ? "i" : ""; },
    soltar: (dx, dy, vx, vy, eje, f) => {
      f.style.translate = ""; delete f.dataset.arr; delete f.dataset.sw;
      if (dx > 90 && alDer) { vibra(); alDer(f); } else if (dx < -90 && alIzq) { vibra(); alIzq(f); }
    },
    cancelar: (f) => { f.style.translate = ""; delete f.dataset.arr; delete f.dataset.sw; },
  });
  filas($("#contenido"), ".fila[data-id]",
    (f) => { const s = porId.get(f.dataset.id); alternarFav(s).then(() => avisar(s.fav ? "Agregada a favoritas" : "Quitada de favoritas", 1400)); },
    (f) => { const s = porId.get(f.dataset.id); if (!R.actual) tocar([s], 0); else { R.siguienteLuego(s); avisar("Sonará a continuación", 1400); } });
  filas($("#cola-lista"), ".fila[data-pos]", (f) => R.quitarDeCola(+f.dataset.pos), null);
  // mantener pulsada una canción abre sus opciones
  let lp = null;
  const limpiar = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  $("#contenido").addEventListener("pointerdown", (e) => {
    const f = e.target.closest(".fila[data-id]"); if (!f || e.target.closest("[data-mas]")) return;
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
      lp = null; vibra(20); const parar = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", parar, true); setTimeout(() => window.removeEventListener("click", parar, true), 700);
      opcionesCancion(porId.get(f.dataset.id), listaDelDetalle());
    }, 480) };
  });
  $("#contenido").addEventListener("pointermove", (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) limpiar(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) $("#contenido").addEventListener(t, limpiar);
}

// ── arranque ──
async function iniciar() {
  history.replaceState({ raiz: 1 }, ""); history.pushState({ s: 1 }, "");   // así el gesto de atrás no cierra la app de golpe
  reproductor = MOTOR ? new ReproductorNativo(MOTOR) : new Reproductor({ obtenerBlob: (id) => db.traer("archivos", id), obtenerPortada: async (s) => (s.alb ? db.traer("portadas", s.alb) : null) });
  window.__onda = { reproductor, E, db, hist: () => HIST, claveC };                                    // para pruebas
  reproductor.instalarControlesSistema(); armarEq(); enlazar();
  await cargarTodo();
  const cfg = await db.traer("ajustes", "config").catch(() => null);
  if (cfg) {
    E.orden = cfg.orden || "titulo"; $("#orden").value = E.orden; reproductor.bandasDb = cfg.bandas?.length === BANDAS.length ? cfg.bandas : reproductor.bandasDb;
    reproductor.preampDb = cfg.pre || 0; reproductor.rgModo = cfg.rg || "pista"; reproductor.eqOn = cfg.eq !== false; reproductor.ponerVelocidad(cfg.vel || 1);
    E.aj.viz = !!cfg.viz; $("#aj-viz").checked = E.aj.viz; E.aj.auto = cfg.auto !== false; $("#aj-auto").checked = E.aj.auto; E.aj.salida = cfg.salida || null; Object.assign(E.aj, cfg.av || {}); if (cfg.av && cfg.av.fondo === undefined) E.aj.acento = "auto";
  }
  sincronizarAjustes(); cargarFondoUsuario();
  HIST = (await db.traer("ajustes", "hist").catch(() => null)) || { m: {}, d: {}, tot: 0 };
  if (cfg?.av && (cfg.av.sistema === false || +cfg.av.minSeg)) await cargarTodo();
  if (MOTOR) { if (cfg?.esp) { reproductor.ancho = cfg.esp.a || 0; reproductor.env = cfg.esp.e || 0; reproductor.graves = cfg.esp.g || 0; } document.querySelectorAll("#aj-viz, #aj-gap, #aj-persistir, #aj-borrar").forEach((e) => { (e.closest(".campo") || e).hidden = true; }); $("#aj-info").textContent = "Motor de audio nativo (ExoPlayer): cambio de canción sin pausa, ecualizador de 10 bandas de 32 bits y lectura directa de tus archivos."; $("#b-agregar").setAttribute("aria-label", "Actualizar biblioteca"); reproductor.aplicarTodo(); document.querySelectorAll(".solo-nativo").forEach((e) => { e.hidden = false; }); $("#aj-salida").hidden = false; $("#aj-salida-info").hidden = false; etiquetaSalida(); reproductor.ponerSalida(E.aj.salida).catch(() => {}); }
  dibujar(); mostrarEspacio();
  if (MOTOR) {
    await iniciarNativo(false);
    try { const e = await MOTOR.estado(); if (e.ids?.length) { const l = e.ids.map((id) => porId.get(id)).filter(Boolean); if (l.length === e.ids.length) { await reproductor.sincronizar(l, e); actualizarMini(); actualizarEstado(); finArranque(); return; } } } catch (_) { /* se restaura la sesión guardada */ }
  }
  const ses = await db.traer("ajustes", "sesion").catch(() => null);
  if (ses?.ids?.length) {
    const lista = ses.ids.map((id) => porId.get(id)).filter(Boolean);
    if (lista.length) {
      const actual = ses.ids[ses.pos], i = Math.max(0, lista.findIndex((s) => s.id === actual));
      reproductor.repetir = ses.rep || "no"; $("#r-rep").dataset.modo = reproductor.repetir;
      reproductor.aleatorio = false;                                         // se conserva el orden ya guardado
      try { await reproductor.cargarCola(lista, i, false); if (ses.t) reproductor.buscar(ses.t); actualizarMini(); actualizarEstado(); } catch (_) { /* archivo faltante */ }
    }
  }
  finArranque();
}
function finArranque() { if ("serviceWorker" in navigator && !MOTOR) navigator.serviceWorker.register("sw.js").catch(() => {}); }

// ── Android: biblioteca leída del teléfono con MediaStore (sin copiar nada) ──
const FORMATOS = { "audio/flac": "FLAC", "audio/x-flac": "FLAC", "audio/mpeg": "MP3", "audio/mp4": "AAC", "audio/aac": "AAC", "audio/ogg": "OGG", "audio/opus": "OPUS", "audio/x-wav": "WAV", "audio/wav": "WAV", "audio/x-ms-wma": "WMA", "audio/amr": "AMR", "audio/x-aiff": "AIFF" };
async function fusionar(nuevas) {
  const viejas = new Map(E.canciones.map((s) => [s.id, s])), vistos = new Set(), lista = [];
  for (const c of nuevas) {
    vistos.add(c.id); const campos = { ...c, alb: claveAlbum(c), formato: FORMATOS[c.mime] || (String(c.nombre).split(".").pop() || "").toUpperCase() };
    const v = viejas.get(c.id);
    if (v) { Object.assign(v, campos); lista.push(v); } else lista.push({ fav: false, ...campos });
  }
  const quitar = E.canciones.filter((s) => !vistos.has(s.id)).map((s) => s.id);
  await db.lote("canciones", lista, quitar);
  E.canciones = filtradas(lista); E.version++; porId.clear(); for (const s of lista) porId.set(s.id, s);
  dibujar(); mostrarEspacio();
}
let escaneando = false;
async function iniciarNativo(manual) {
  if (escaneando) return; escaneando = true;
  try {
    const r = await MOTOR.permisos(); E.sinPermiso = !r.audio;
    if (E.sinPermiso) { dibujar(); if (manual) avisar("Sin permiso no puedo ver tu música. Actívalo en Ajustes del teléfono → Apps → Onda → Permisos.", 6000); return; }
    avisar(manual ? "Actualizando…" : "Buscando música…", 0); const t0 = performance.now();
    const res = await MOTOR.escanear(); await fusionar(res.canciones || []);
    avisar(`${E.canciones.length} canciones listas (${((performance.now() - t0) / 1000).toFixed(1)} s)`, 2600);
    portadasNativas().then(() => autoPortadas()).catch(() => {});
  } catch (e) { avisar("No pude leer tu música: " + String(e?.message || e), 6000); }
  finally { escaneando = false; }
}
// ── portadas desde internet o galería ──
const texto = async (url) => {
  if (MOTOR) { const r = await MOTOR.texto({ url }); return r.cuerpo; }
  const r = await fetch(url); if (!r.ok) throw new Error("http " + r.status); return r.text();
};
async function ponerPortada(alb, blob) {
  await db.poner("portadas", blob, alb); urlsPort.delete(alb);
  imgsDe(alb).forEach(hidratar);
  if (reproductor.actual?.alb === alb) actualizarMini();
}
async function portadaWeb(s, callado) {
  if (!callado) avisar("Buscando portada…", 0);
  try {
    const url = await buscarPortadaUrl(texto, s);
    if (!url) { if (!callado) avisar(`No encontré la portada de “${s.album || s.titulo}”. Puedes elegir una de tu galería.`, 5000); return false; }
    let blob;
    if (MOTOR) { const r = await MOTOR.descargar({ url, albumId: s.albumId || s.alb }); blob = await (await fetch(window.Capacitor.convertFileSrc(r.ruta))).blob(); }
    else blob = await miniatura(await (await fetch(url)).blob());
    await ponerPortada(s.alb, blob); await db.borrar("ajustes", "sinportada:" + s.alb).catch(() => {});
    if (!callado) avisar("Portada lista", 1800); return true;
  } catch (e) { if (!callado) avisar("No pude descargar la portada. ¿Tienes internet?", 4500); return false; }
}
let imagenPara = null;
function elegirImagen(s) { imagenPara = s; $("#f-imagen").click(); }
async function descargarFaltantes(manual) {
  const sem = Math.floor(Date.now() / (7 * 864e5));                        // lo que no se encontró se vuelve a intentar cada semana
  const albumes = new Map(); for (const s of E.canciones) if (!albumes.has(s.alb)) albumes.set(s.alb, s);
  const tienen = new Set(await db.claves("portadas")), marcas = new Set(await db.claves("ajustes"));
  const faltan = []; for (const [alb, s] of albumes) if (!tienen.has(alb) && (manual || !marcas.has(`sinweb:${alb}:${sem}`))) faltan.push(s);
  if (!faltan.length) { if (manual) avisar("Todas las canciones ya tienen portada.", 2500); return 0; }
  let k = 0, ok = 0, hechas = 0;
  const obrero = async () => {                                             // 3 a la vez
    while (k < faltan.length) {
      const s = faltan[k++];
      if (await portadaWeb(s, true)) ok++; else await db.poner("ajustes", true, `sinweb:${s.alb}:${sem}`).catch(() => {});
      hechas++; if (manual || hechas % 6 === 0) avisar(`Buscando carátulas… ${hechas} de ${faltan.length}`, manual ? 0 : 1600);
    }
  };
  await Promise.all([obrero(), obrero(), obrero()]);
  if (manual || ok) avisar(`Carátulas nuevas: ${ok} de ${faltan.length}`, 3500);
  return ok;
}
// automático, como Poweramp: mientras Onda está abierta va buscando las carátulas que faltan
let autoOcupado = false, ultimaAuto = 0; const intentadasSesion = new Set();
async function autoPortadas() {
  if (!MOTOR || autoOcupado || E.aj.auto === false || !E.canciones.length || navigator.onLine === false) return;
  autoOcupado = true; try { await descargarFaltantes(false); } catch (_) { /* se reintenta luego */ } finally { autoOcupado = false; ultimaAuto = Date.now(); }
}
setInterval(() => { if (!document.hidden && Date.now() - ultimaAuto > 120000) autoPortadas(); }, 30000);
window.addEventListener("online", () => autoPortadas());

// ── letras ──
let letraAct = { id: null, lineas: [], idx: -2 };
async function abrirLetra() { const s = reproductor.actual; if (!s) return; if (!pila.includes("hoja-letra")) abrir("hoja-letra"); await cargarLetra(s); }
async function cargarLetra(s) {
  const cuerpo = $("#letra-cuerpo"); $("#letra-titulo").textContent = s.titulo || s.nombre;
  letraAct = { id: s.id, lineas: [], idx: -2, textos: [], trad: null };
  cuerpo.className = "letra-cuerpo"; cuerpo.innerHTML = `<div class="vacio">Buscando la letra…</div>`;
  let L = await db.traer("ajustes", "letra2:" + s.id).catch(() => null), error = false;
  if (!L) { try { L = await buscarLetraCompleta(texto, s); } catch (_) { error = true; } if (L) await db.poner("ajustes", L, "letra2:" + s.id).catch(() => {}); }
  if (letraAct.id !== s.id) return;                                       // mientras tanto cambió la canción
  if (!L) { cuerpo.innerHTML = `<div class="vacio">${error ? "No pude buscar la letra. ¿Tienes internet?" : "No encontré la letra de esta canción."}<br><button class="boton" id="letra-reintento" type="button" style="margin-top:14px">Intentar otra vez</button> <button class="boton" id="letra-pegar" type="button" style="margin-top:14px">Pegar letra</button></div>`; return; }
  const lineas = parsearLRC(L.sincronizada);
  letraAct.L = L; letraAct.sinc = lineas.length > 0;
  if (lineas.length) { letraAct.lineas = lineas; letraAct.textos = lineas.map((l) => l.txt); }
  else letraAct.textos = String(L.plana).split(/\r?\n/);
  letraAct.trad = await db.traer("ajustes", "trad:" + s.id).catch(() => null);
  if (!letraAct.trad && L.traduccion && lineas.length) {                  // traducción que ya trae el servicio, alineada por tiempo
    const tl = parsearLRC(L.traduccion); if (tl.length) letraAct.trad = lineas.map((l) => { const m = tl.find((x) => Math.abs(x.t - l.t) < 0.6); return m ? m.txt : ""; });
  }
  pintarLetra(); if (letraAct.sinc) actualizarLetra(true);
}
function pintarLetra() {
  const cuerpo = $("#letra-cuerpo"), ver = tradLetra && letraAct.trad;
  cuerpo.className = "letra-cuerpo" + (letraAct.sinc ? "" : " plana");
  cuerpo.innerHTML = letraAct.textos.map((t, i) => `<p${letraAct.sinc ? ` data-i="${i}"` : ""}>${esc(t) || (letraAct.sinc ? "♪" : "&nbsp;")}${ver && letraAct.trad[i] ? `<small>${esc(letraAct.trad[i])}</small>` : ""}</p>`).join("");
  cuerpo.insertAdjacentHTML("beforeend", `<div class="vacio"><button class="boton" id="letra-pegar" type="button">Cambiar letra</button></div>`);
  $("#letra-trad").setAttribute("aria-pressed", String(!!ver)); letraAct.idx = -2;
}
let tradLetra = false;
function pegarLetra() {
  const s = reproductor.actual; if (!s) return; const cuerpo = $("#letra-cuerpo");
  cuerpo.className = "letra-cuerpo"; cuerpo.innerHTML = `<div class="vacio"><p>Pega aquí la letra (con o sin tiempos tipo [01:23.45]).</p><textarea id="letra-texto" rows="12" style="width:100%;padding:12px;border-radius:16px;color:var(--tx);background:rgba(255,255,255,.1);font-size:1rem"></textarea><br><button class="boton" id="letra-guardar" type="button" style="margin-top:12px">Guardar letra</button></div>`;
  $("#letra-guardar").onclick = async () => {
    const t = $("#letra-texto").value.trim(); if (!t) return;
    const L = parsearLRC(t).length ? { sincronizada: t, plana: "" } : { sincronizada: "", plana: t };
    await db.poner("ajustes", L, "letra2:" + s.id).catch(() => {}); await db.borrar("ajustes", "trad:" + s.id).catch(() => {}); cargarLetra(s);
  };
}
async function alternarTraduccion() {
  const s = reproductor.actual; if (!s || !letraAct.textos.length) return;
  if (tradLetra && letraAct.trad) { tradLetra = false; pintarLetra(); if (letraAct.sinc) actualizarLetra(true); return; }
  tradLetra = true;
  if (!letraAct.trad) {
    avisar("Traduciendo…", 0);
    try { letraAct.trad = await traducir(texto, letraAct.textos, "es"); await db.poner("ajustes", letraAct.trad, "trad:" + s.id).catch(() => {}); avisar("Listo", 1200); }
    catch (_) { tradLetra = false; avisar("No pude traducir. ¿Tienes internet?"); return; }
  }
  if (letraAct.id === s.id) { pintarLetra(); if (letraAct.sinc) actualizarLetra(true); }
}
function actualizarLetra(salto) {
  if (!pila.includes("hoja-letra") || !letraAct.lineas.length) return;
  const i = lineaActual(letraAct.lineas, reproductor.tiempo + 0.2); if (i === letraAct.idx) return;
  letraAct.idx = i; const ps = $("#letra-cuerpo").children;
  for (let k = 0; k < ps.length; k++) { ps[k].classList.toggle("actual", k === i); ps[k].classList.toggle("pasada", k < i); }
  if (i >= 0) ps[i].scrollIntoView({ block: "center", behavior: salto ? "auto" : "smooth" });
}

async function portadasNativas() {
  const albumes = new Map(); for (const s of E.canciones) if (!albumes.has(s.alb)) albumes.set(s.alb, s);
  const tienen = new Set(await db.claves("portadas")), marcas = new Set(await db.claves("ajustes"));
  const pendientes = [...albumes].filter(([alb]) => !tienen.has(alb) && !marcas.has("sinportada:" + alb));
  let k = 0;
  const obrero = async () => {                                            // 3 a la vez: la lectura de portadas es lo más lento
    while (k < pendientes.length) {
      const [alb, s] = pendientes[k++];
      try {
        const r = await MOTOR.portada({ albumId: s.albumId, uri: s.uri });
        if (!r.ruta) { await db.poner("ajustes", true, "sinportada:" + alb); continue; }
        const b = await (await fetch(window.Capacitor.convertFileSrc(r.ruta))).blob();
        await db.poner("portadas", b, alb); urlsPort.delete(alb);
        imgsDe(alb).forEach(hidratar);
        if (reproductor.actual?.alb === alb) actualizarMini();
      } catch (_) { /* se sigue con el siguiente álbum */ }
    }
  };
  await Promise.all([obrero(), obrero(), obrero()]);
}
iniciar();
