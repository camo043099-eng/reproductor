// Portadas y letras desde internet (servicios gratuitos y sin cuenta: iTunes, Deezer y LRCLIB).
// `texto(url)` es una función que devuelve el contenido de la dirección (en la app Android la hace el motor nativo para evitar bloqueos del navegador).

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, " ").trim();
const coincide = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
const conLimite = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("tiempo agotado")), ms))]);
const json = async (texto, url) => JSON.parse(await conLimite(Promise.resolve(texto(url)), 6000));    // un servicio lento ya no deja la búsqueda colgada

/** URL de la portada más probable según artista, álbum y título (o null) */
const GENERICOS = new Set(["music", "musica", "download", "downloads", "descargas", "audio", "audios", "songs", "unknown album", "album", "sin album", "0", "sdcard", "telegram", "whatsapp audio", "ringtones", "alarms", "notifications", "recordings", "podcasts", "mp3", "flac", "new folder"]);
const _gen = new Map();   // se llama por cada canción al dibujar listas: el resultado de cada texto se recuerda
export const albumGenerico = (a) => { if (!a) return true; let r = _gen.get(a); if (r === undefined) { const n = norm(a); r = GENERICOS.has(n) || /^unknown|desconocid/.test(n); _gen.set(a, r); } return r; };
const exacto = (a, b) => !!norm(a) && norm(a) === norm(b);
export async function buscarPortadaUrl(texto, s) {
  const artista = s.albumArtista || s.artista || "", titulo = s.titulo || s.nombre || "", album = albumGenerico(s.album) ? "" : (s.album || ""), dur = s.duracion || 0;
  const sinArtista = !artista || /^unknown|desconocid/.test(norm(artista));
  const grande = (u) => String(u || "").replace(/\/\d+x\d+(bb)?\.(jpg|png)/, "/1000x1000bb.jpg");
  const intentos = [
    async () => {                                                                         // iTunes: por álbum
      if (!album || sinArtista) return null;
      const j = await json(texto, `https://itunes.apple.com/search?media=music&entity=album&limit=8&term=${encodeURIComponent(artista + " " + album)}`);
      const puntos = (r) => (coincide(r.artistName, artista) ? 2 : 0) + (coincide(r.collectionName, album) ? 2 : 0);
      const m = (j.results || []).map((r) => [puntos(r), r]).filter(([p]) => p >= 4).sort((a, b) => b[0] - a[0])[0];
      return m ? grande(m[1].artworkUrl100) : null;
    },
    async () => {                                                                         // Deezer: por canción (verifica título, artista y duración)
      if (sinArtista || !titulo) return null;
      const j = await json(texto, `https://api.deezer.com/search/track?q=${encodeURIComponent(`artist:"${artista}" track:"${titulo}"`)}`);
      const m = (j.data || []).find((r) => coincide(r.artist?.name, artista) && coincide(r.title, titulo) && (!dur || !r.duration || Math.abs(r.duration - dur) < 6));
      return m ? m.album?.cover_xl || m.album?.cover_big || null : null;
    },
    async () => {                                                                         // iTunes: por canción
      if (!titulo) return null;
      const j = await json(texto, `https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${encodeURIComponent(artista + " " + titulo)}`);
      const m = (j.results || []).find((r) => (sinArtista ? exacto(r.trackName, titulo) : coincide(r.trackName, titulo) && coincide(r.artistName, artista)) && (!dur || !r.trackTimeMillis || Math.abs(r.trackTimeMillis / 1000 - dur) < 6));
      return m ? grande(m.artworkUrl100) : null;
    },
    async () => {                                                                         // Deezer
      if (sinArtista || !album) return null;
      const q = album ? `${artista} ${album}` : `${artista} ${titulo}`;
      const j = await json(texto, `https://api.deezer.com/search/album?q=${encodeURIComponent(q.trim())}`);
      const m = (j.data || []).find((r) => coincide(r.artist?.name, artista) && (!album || coincide(r.title, album)));
      return m ? m.cover_xl || m.cover_big || null : null;
    },
  ];
  for (const f of intentos) { try { const u = await f(); if (u) return u; } catch (_) { /* se prueba el siguiente servicio */ } }
  return null;
}

/** Variantes del título y del artista para buscar mejor (quita números de pista, paréntesis y mezcla de idiomas) */
export function variantes(s) {
  const bruto = String(s.titulo || s.nombre || "").replace(/\.[a-z0-9]{2,4}$/i, "");
  const sinNum = bruto.replace(/^\s*\d{1,3}\s*[.\-_)]\s*/, "");
  const sinParen = sinNum.replace(/\(.*?\)|\[.*?\]|（.*?）/g, " ").replace(/\s+(feat|ft|with)\.?\s.*$/i, "").replace(/\s+/g, " ").trim();
  const cjk = (sinParen.match(/[぀-ヿ一-鿿가-힯][぀-ヿ一-鿿가-힯\s·]*/g) || []).join(" ").trim();
  const latin = sinParen.replace(/[぀-ヿ一-鿿가-힯]+/g, " ").replace(/\s+/g, " ").trim();
  const titulos = [...new Set([sinNum, sinParen, latin, cjk].map((t) => t.trim()).filter((t) => t.length > 0))];
  const arts = [...new Set([(s.artista || s.albumArtista || "").split(/\s*(?:,|&|;| feat\.?| ft\.?| x )\s*/i)[0].trim(), ""])];
  return { titulos, arts };
}

/** Letra de la canción: {sincronizada, plana} o null */
export async function buscarLetra(texto, s) {
  const { titulos, arts } = variantes(s), dur = s.duracion || 0;
  const bueno = (r, t) => (r.syncedLyrics || r.plainLyrics) && (!dur || !r.duration || Math.abs(r.duration - dur) < 15) && (coincide(r.trackName, t) || coincide(r.trackName, s.titulo || ""));
  const mejor = (lista, t) => (lista || []).filter((r) => bueno(r, t)).sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur))[0];
  const salida = (r) => ({ sincronizada: r.syncedLyrics || "", plana: r.plainLyrics || "" });
  for (const t of titulos) for (const a of arts) {
    if (!a) continue;
    const q = new URLSearchParams({ artist_name: a, track_name: t }); if (s.album) q.set("album_name", s.album); if (dur) q.set("duration", String(Math.round(dur)));
    try { const j = await json(texto, "https://lrclib.net/api/get?" + q); if (j.syncedLyrics || j.plainLyrics) return salida(j); } catch (_) { /* sin coincidencia exacta */ }
  }
  for (const t of titulos) for (const a of arts) {
    try { const r = mejor(await json(texto, "https://lrclib.net/api/search?q=" + encodeURIComponent(`${a} ${t}`.trim())), t); if (r) return salida(r); } catch (_) { /* siguiente intento */ }
  }
  for (const t of titulos) {                                                       // solo por título, por si el artista viene distinto
    try { const r = mejor(await json(texto, "https://lrclib.net/api/search?track_name=" + encodeURIComponent(t)), t); if (r) return salida(r); } catch (_) { /* siguiente */ }
  }
  return null;
}

/** NetEase (muy buena para música china, japonesa y de juegos): letra sincronizada y a veces traducción */
async function letraNetEase(texto, s) {
  const { titulos, arts } = variantes(s), dur = s.duracion || 0;
  for (const t of titulos) for (const a of arts) {
    try {
      const r = await json(texto, "https://music.163.com/api/search/get/web?csrf_token=&type=1&limit=10&offset=0&s=" + encodeURIComponent(`${t} ${a}`.trim()));
      const c = ((r.result && r.result.songs) || []).map((x) => [Math.abs((x.duration || 0) / 1000 - dur), x]).filter(([d]) => !dur || d < 6).sort((x, y) => x[0] - y[0])[0];
      if (!c) continue;
      const j = await json(texto, `https://music.163.com/api/song/lyric?id=${c[1].id}&lv=1&kv=1&tv=-1`);
      const sinc = j.lrc && j.lrc.lyric ? j.lrc.lyric : "";
      if (parsearLRC(sinc).length) return { sincronizada: sinc, plana: "", traduccion: j.tlyric && j.tlyric.lyric ? j.tlyric.lyric : "" };
    } catch (_) { /* siguiente variante */ }
  }
  return null;
}

/** Último recurso: letra sin tiempos (lyrics.ovh) */
async function letraPlana(texto, s) {
  const { titulos, arts } = variantes(s);
  for (const t of titulos) for (const a of arts) {
    if (!a) continue;
    try { const j = await json(texto, `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`); if (j.lyrics && j.lyrics.trim().length > 20) return { sincronizada: "", plana: j.lyrics.replace(/\r/g, "").trim() }; } catch (_) { /* siguiente */ }
  }
  return null;
}

/** Letra de la canción con respaldo: si LRCLIB no la tiene sincronizada se prueba NetEase */
export async function buscarLetraCompleta(texto, s) {
  let L = null; try { L = await buscarLetra(texto, s); } catch (_) { /* se sigue */ }
  if (L && parsearLRC(L.sincronizada).length) return L;
  try { const N = await letraNetEase(texto, s); if (N) return { ...N, plana: (L && L.plana) || "" }; } catch (_) { /* sin respaldo */ }
  if (L) return L;
  try { return await letraPlana(texto, s); } catch (_) { return null; }
}

/** Traduce una lista de líneas con el traductor gratuito de Google; devuelve una lista del mismo largo */
export async function traducir(texto, lineas, destino = "es") {
  try { return await traducirGoogle(texto, lineas, destino, "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${destino}&dt=t&q="); }
  catch (e1) {
    try { return await traducirGoogle(texto, lineas, destino, "https://clients5.google.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${destino}&dt=t&q="); }
    catch (e2) { return await traducirMyMemory(texto, lineas, destino); }   // último recurso: otro servicio, línea por línea
  }
}
async function traducirGoogle(texto, lineas, destino, base) {
  const out = []; let i = 0;
  while (i < lineas.length) {
    const trozo = []; let largo = 0;
    while (i < lineas.length && largo < 1400) { const t = lineas[i] && lineas[i].trim() ? lineas[i] : "·"; trozo.push(t); largo += encodeURIComponent(t).length + 3; i++; }
    const j = await json(texto, base.replace("${destino}", destino) + encodeURIComponent(trozo.join("\n")));
    if (!j || !Array.isArray(j[0])) throw new Error("respuesta inesperada");
    const todo = j[0].map((x) => x[0] || "").join(""), partes = todo.split("\n");
    for (let k = 0; k < trozo.length; k++) out.push(trozo[k] === "·" ? "" : partes.length === trozo.length ? partes[k].trim() : k === 0 ? todo : "");
  }
  return out;
}
async function traducirMyMemory(texto, lineas, destino) {
  const out = new Array(lineas.length).fill(""); let k = 0, ok = 0;
  const obrero = async () => {
    while (k < lineas.length) {
      const i = k++, t = (lineas[i] || "").trim(); if (!t) continue;
      const j = await json(texto, `https://api.mymemory.translated.net/get?langpair=autodetect|${destino}&q=${encodeURIComponent(t.slice(0, 450))}`).catch(() => null);
      const r = j && j.responseData && j.responseData.translatedText; if (r && !/MYMEMORY WARNING|INVALID/i.test(r)) { out[i] = r; ok++; }
    }
  };
  await Promise.all([obrero(), obrero(), obrero(), obrero()]);
  if (!ok) throw new Error("ningún servicio de traducción respondió");
  return out;
}

/** "[01:23.45] texto" → [{t: segundos, txt}] */
export function parsearLRC(lrc) {
  const out = [];
  for (const linea of String(lrc || "").split(/\r?\n/)) {
    const marcas = [...linea.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; if (!marcas.length) continue;
    const txt = linea.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of marcas) out.push({ t: +m[1] * 60 + parseFloat(m[2]), txt });
  }
  return out.sort((a, b) => a.t - b.t);
}
/** índice de la línea que suena en el segundo `seg` (-1 si todavía no empieza) */
export function lineaActual(lineas, seg) {
  let lo = 0, hi = lineas.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lineas[m].t <= seg) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/** varias carátulas posibles (para elegir a mano): iTunes (canción y álbum) y Deezer */
export async function candidatasPortada(texto, consulta) {
  const q = encodeURIComponent(String(consulta || "").trim()); if (!q) return [];
  const grande = (u) => String(u || "").replace(/\/\d+x\d+(bb)?\.(jpg|png)/, "/1000x1000bb.jpg"), chica = (u) => String(u || "").replace(/\/\d+x\d+(bb)?\.(jpg|png)/, "/220x220bb.jpg");
  const listas = await Promise.all([
    json(texto, `https://itunes.apple.com/search?media=music&entity=song&limit=14&term=${q}`).then((j) => (j.results || []).filter((r) => r.artworkUrl100).map((r) => ({ url: grande(r.artworkUrl100), mini: chica(r.artworkUrl100), titulo: r.collectionName || r.trackName, artista: r.artistName }))).catch(() => []),
    json(texto, `https://itunes.apple.com/search?media=music&entity=album&limit=10&term=${q}`).then((j) => (j.results || []).filter((r) => r.artworkUrl100).map((r) => ({ url: grande(r.artworkUrl100), mini: chica(r.artworkUrl100), titulo: r.collectionName, artista: r.artistName }))).catch(() => []),
    json(texto, `https://api.deezer.com/search?q=${q}`).then((j) => (j.data || []).filter((r) => r.album && (r.album.cover_xl || r.album.cover_big)).map((r) => ({ url: r.album.cover_xl || r.album.cover_big, mini: r.album.cover_medium || r.album.cover, titulo: r.album.title, artista: r.artist && r.artist.name }))).catch(() => []),
  ]);
  const vistos = new Set(), out = [];
  for (let i = 0; out.length < 18; i++) {                                                  // intercala las tres fuentes
    let hubo = false;
    for (const l of listas) if (l[i]) { hubo = true; const c = l[i], k = norm((c.titulo || "") + "|" + (c.artista || "")); if (!vistos.has(k)) { vistos.add(k); out.push(c); } }
    if (!hubo) break;
  }
  return out;
}

/** Búsqueda libre de letras (cualquier canción del mundo, no solo la que suena): lista de {titulo, artista, dur, sinc, L} */
export async function buscarLetrasGlobal(texto, consulta) {
  const q = String(consulta || "").trim(); if (!q) return [];
  const r = await json(texto, "https://lrclib.net/api/search?q=" + encodeURIComponent(q));
  return (r || []).filter((x) => x.syncedLyrics || x.plainLyrics).slice(0, 25).map((x) => ({ titulo: x.trackName, artista: x.artistName, album: x.albumName, dur: x.duration || 0, sinc: !!x.syncedLyrics, L: { sincronizada: x.syncedLyrics || "", plana: x.plainLyrics || "" } }));
}
