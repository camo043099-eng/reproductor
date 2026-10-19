// Recomendador local de Onda: aprende de lo que escuchas, sin enviar nada a internet.
// Entrada: canciones + historial. Salida: mixes del día. Todo es determinista para un mismo día (semilla), así la lista no cambia cada vez que abres la app.

export const BLOQUES = ["madrugada", "mañana", "tarde", "noche"];
export const bloqueDe = (fecha = new Date()) => { const h = fecha.getHours(); return h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3; };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function semillaDe(texto) { let h = 2166136261; for (const c of String(texto)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** peso de gusto de una canción según su historial (reproducciones, tiempo escuchado, favorita, saltos y lo reciente que fue) */
export function peso(s, e, ahora) {
  e = e || {}; const dias = e.u ? Math.max(0, (ahora - e.u) / 864e5) : 999, durMs = Math.max(30000, (s.duracion || 200) * 1000);
  const jugado = (e.n || 0) + Math.min(6, (e.ms || 0) / durMs) * 0.4;
  return Math.max(0, jugado * Math.exp(-dias / 45) + (s.fav ? 3 : 0) - (e.sk || 0) * 1.2);
}

export function crearMixes({ canciones, hist, ahora = Date.now(), dia = "", claveC, generosDe, bloque = bloqueDe(new Date(ahora)), nombreArtista = (s) => s.albumArtista || s.artista || "", extra = 0, max = 35 }) {
  const rnd = mulberry32(semillaDe(dia + "|onda|" + extra)), H = (hist && hist.m) || {};
  const ent = (s) => H[claveC(s)] || {};
  const art = new Map(), gen = new Map(), alb = new Map(); let hayDatos = false;
  const w = new Map();
  for (const s of canciones) {
    const p = peso(s, ent(s), ahora); w.set(s, p); if (p > 0) hayDatos = true;
    const a = normaliza(nombreArtista(s)); art.set(a, (art.get(a) || 0) + p);
    for (const g of generosDe(s)) gen.set(g, (gen.get(g) || 0) + p);
    if (s.alb) alb.set(s.alb, (alb.get(s.alb) || 0) + p);
  }
  const norm = (m) => { const mx = Math.max(0, ...m.values()) || 1; for (const [k, v] of m) m.set(k, v / mx); return m; };
  norm(art); norm(gen); norm(alb);
  const maxW = Math.max(0, ...w.values()) || 1;
  const afinidad = (s) => { const g = generosDe(s); return 0.5 * (art.get(normaliza(nombreArtista(s))) || 0) + 0.3 * (g.length ? Math.max(...g.map((x) => gen.get(x) || 0)) : 0) + 0.2 * (alb.get(s.alb) || 0); };
  const horas = (s) => { const h = ent(s).hr; const t = h ? h.reduce((a, b) => a + b, 0) : 0; return t ? h[bloque] / t : 0; };
  const puntos = (s) => {
    const e = ent(s), reciente = e.u ? (ahora - e.u) / 36e5 : 999;
    let p = afinidad(s) + 0.8 * (w.get(s) / maxW) + (s.fav ? 0.4 : 0) + 0.3 * horas(s) + rnd() * 0.18;
    if (reciente < 6) p -= 0.9; else if (reciente < 24) p -= 0.45;
    if ((e.sk || 0) >= 3 && (e.n || 0) <= (e.sk || 0)) p -= 0.7;
    return p;
  };
  const P = new Map(canciones.map((s) => [s, puntos(s)])), E0 = new Map(canciones.map((s) => [s, afinidad(s) + rnd() * 0.1]));   // se calculan una vez (el ruido aleatorio no puede cambiar durante un ordenamiento)
  const sinOir = (s) => !(ent(s).n > 0);
  /** toma canciones en orden de puntaje cuidando que no se repita el mismo artista seguido */
  const diverso = (lista, n, porArtista = 3) => {
    const out = [], cuenta = new Map(), cola = [], resto = [];
    for (const s of lista) {
      const a = normaliza(nombreArtista(s)), c = cuenta.get(a) || 0;
      if (c >= porArtista) { resto.push(s); continue; } if (out.slice(-2).some((x) => normaliza(nombreArtista(x)) === a)) { cola.push(s); continue; }
      out.push(s); cuenta.set(a, c + 1); if (out.length >= n) break;
    }
    for (const s of cola) { if (out.length >= n) break; const a = normaliza(nombreArtista(s)); if ((cuenta.get(a) || 0) < porArtista) { out.push(s); cuenta.set(a, (cuenta.get(a) || 0) + 1); } }
    for (const s of resto) { if (out.length >= Math.min(n, 20)) break; out.push(s); }   // biblioteca con pocos artistas: se relaja el tope para no dejar la lista corta
    return out;
  };
  const mezcla = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const mixes = [], usadas = new Set();
  const poner = (id, nombre, sub, lista, etiqueta) => { if (lista.length >= 3) mixes.push({ id, nombre, sub, etiqueta, ids: lista.map((s) => s.id) }); };

  if (!hayDatos) {                                                     // todavía no sabe nada: mezcla agradable con lo más nuevo y algo al azar
    const nuevas = canciones.slice().sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, 80);
    poner("hoy", "Tu mix de hoy", "Escucha más música y aprenderé tus gustos", diverso(mezcla(nuevas.concat(mezcla(canciones).slice(0, 60))), max), "PARA TI");
    poner("descubre", "Descubre algo nuevo", "Sorpresas de tu propia música", diverso(mezcla(canciones), 30), "DESCUBRE");
    return { mixes, aprendiendo: true };
  }

  // 1) mix del día: lo más afín, con ~25% de cosas que todavía no has oído
  const ordenadas = canciones.slice().sort((a, b) => P.get(b) - P.get(a));
  const conocidas = ordenadas.filter((s) => !sinOir(s)), nuevas = ordenadas.filter(sinOir);
  const nHoy = Math.round(max * 0.75), hoy = diverso(conocidas, nHoy).concat(diverso(nuevas, max - nHoy));
  poner("hoy", "Tu mix de hoy", `Hecho con lo que más escuchas · ${BLOQUES[bloque]}`, diverso(mezcla(hoy), max, 4), "PARA TI"); hoy.forEach((s) => usadas.add(s.id));

  // 2) descubrir: música que no has reproducido de los artistas y géneros que te gustan
  const desc = diverso(nuevas.slice().sort((a, b) => E0.get(b) - E0.get(a)), 30, 3);
  poner("descubre", "Descubre algo nuevo", "De los artistas y géneros que te gustan, sin escuchar aún", desc, "DESCUBRE");

  // 3) para este momento del día
  const momento = canciones.filter((s) => horas(s) > 0.4 && ent(s).n > 0).sort((a, b) => horas(b) + (w.get(b) / maxW) * 0.3 - (horas(a) + (w.get(a) / maxW) * 0.3));
  poner("momento", `Para tu ${BLOQUES[bloque]}`, "Lo que sueles escuchar a esta hora", diverso(mezcla(momento.slice(0, 60)), 30, 4), "AHORA");

  // 4) redescubre: favoritas o muy escuchadas que hace tiempo no suenan
  const olvidadas = canciones.filter((s) => (s.fav || (ent(s).n || 0) >= 2) && (!ent(s).u || (ahora - ent(s).u) / 864e5 > 30));
  poner("redescubre", "Redescubre", "Canciones que quieres y hace tiempo no oyes", diverso(mezcla(olvidadas), 30, 3), "VUELVE");

  // 5) mixes de tus artistas más afines
  const topArt = [...art].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  topArt.forEach((a, i) => {
    const propias = canciones.filter((s) => normaliza(nombreArtista(s)) === a), gs = new Set(propias.flatMap(generosDe));
    const parecidas = canciones.filter((s) => normaliza(nombreArtista(s)) !== a && generosDe(s).some((g) => gs.has(g))).sort((x, y) => P.get(y) - P.get(x)).slice(0, 14);
    const nombre = nombreArtista(propias[0] || {}) || "Artista";
    poner("art" + i, `Mix de ${nombre}`, `${nombre} y música parecida`, mezcla(propias.sort((x, y) => P.get(y) - P.get(x)).slice(0, 16).concat(parecidas)).slice(0, 30), "MIX");
  });
  return { mixes, aprendiendo: false };
}

function normaliza(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
