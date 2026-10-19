// Portadas y letras desde internet (servicios gratuitos y sin cuenta: iTunes, Deezer y LRCLIB).
// `texto(url)` es una función que devuelve el contenido de la dirección (en la app Android la hace el motor nativo para evitar bloqueos del navegador).

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, " ").trim();
const coincide = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
const json = async (texto, url) => JSON.parse(await texto(url));

/** URL de la portada más probable según artista, álbum y título (o null) */
export async function buscarPortadaUrl(texto, s) {
  const artista = s.albumArtista || s.artista || "", album = s.album || "", titulo = s.titulo || "";
  const grande = (u) => String(u || "").replace(/\/\d+x\d+(bb)?\.(jpg|png)/, "/1000x1000bb.jpg");
  const intentos = [
    async () => {                                                                         // iTunes: por álbum
      if (!album) return null;
      const j = await json(texto, `https://itunes.apple.com/search?media=music&entity=album&limit=8&term=${encodeURIComponent(artista + " " + album)}`);
      const puntos = (r) => (coincide(r.artistName, artista) ? 2 : 0) + (coincide(r.collectionName, album) ? 2 : 0);
      const m = (j.results || []).map((r) => [puntos(r), r]).filter(([p]) => p >= 4 || (p >= 2 && !artista)).sort((a, b) => b[0] - a[0])[0];
      return m ? grande(m[1].artworkUrl100) : null;
    },
    async () => {                                                                         // iTunes: por canción
      if (!titulo) return null;
      const j = await json(texto, `https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${encodeURIComponent(artista + " " + titulo)}`);
      const m = (j.results || []).find((r) => coincide(r.trackName, titulo) && (!artista || coincide(r.artistName, artista)));
      return m ? grande(m.artworkUrl100) : null;
    },
    async () => {                                                                         // Deezer
      const q = album ? `${artista} ${album}` : `${artista} ${titulo}`;
      const j = await json(texto, `https://api.deezer.com/search/album?q=${encodeURIComponent(q.trim())}`);
      const m = (j.data || []).find((r) => coincide(r.artist?.name, artista) && (!album || coincide(r.title, album)));
      return m ? m.cover_xl || m.cover_big || null : null;
    },
  ];
  for (const f of intentos) { try { const u = await f(); if (u) return u; } catch (_) { /* se prueba el siguiente servicio */ } }
  return null;
}

/** Letra de la canción: {sincronizada, plana} o null */
export async function buscarLetra(texto, s) {
  const artista = s.artista || s.albumArtista || "", titulo = s.titulo || s.nombre || "";
  const limpio = (t) => String(t).replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, " ").trim();
  const q = new URLSearchParams({ artist_name: artista, track_name: titulo }); if (s.album) q.set("album_name", s.album); if (s.duracion) q.set("duration", String(Math.round(s.duracion)));
  try { const j = await json(texto, "https://lrclib.net/api/get?" + q); if (j.syncedLyrics || j.plainLyrics) return { sincronizada: j.syncedLyrics || "", plana: j.plainLyrics || "" }; } catch (_) { /* sin coincidencia exacta */ }
  try {
    const lista = await json(texto, "https://lrclib.net/api/search?q=" + encodeURIComponent(limpio(`${artista} ${titulo}`)));
    const cerca = (lista || []).filter((r) => r.syncedLyrics || r.plainLyrics).map((r) => [Math.abs((r.duration || 0) - (s.duracion || 0)) + (coincide(r.trackName, titulo) ? 0 : 60), r]).sort((a, b) => a[0] - b[0])[0];
    if (cerca && cerca[0] < 12) return { sincronizada: cerca[1].syncedLyrics || "", plana: cerca[1].plainLyrics || "" };
  } catch (_) { /* nada más que probar */ }
  return null;
}

/** NetEase (muy buena para música china, japonesa y de juegos): letra sincronizada y a veces traducción */
async function letraNetEase(texto, s) {
  const artista = (s.artista || "").split(/[,&;]/)[0].trim(), titulo = s.titulo || s.nombre || "";
  const r = await json(texto, "https://music.163.com/api/search/get/web?csrf_token=&type=1&limit=8&offset=0&s=" + encodeURIComponent(`${titulo} ${artista}`.trim()));
  const c = ((r.result && r.result.songs) || []).map((x) => [Math.abs((x.duration || 0) / 1000 - (s.duracion || 0)), x]).filter(([d]) => !s.duracion || d < 5).sort((a, b) => a[0] - b[0])[0];
  if (!c) return null;
  const j = await json(texto, `https://music.163.com/api/song/lyric?id=${c[1].id}&lv=1&kv=1&tv=-1`);
  const sinc = j.lrc && j.lrc.lyric ? j.lrc.lyric : "";
  return parsearLRC(sinc).length ? { sincronizada: sinc, plana: "", traduccion: j.tlyric && j.tlyric.lyric ? j.tlyric.lyric : "" } : null;
}

/** Letra de la canción con respaldo: si LRCLIB no la tiene sincronizada se prueba NetEase */
export async function buscarLetraCompleta(texto, s) {
  let L = null; try { L = await buscarLetra(texto, s); } catch (_) { /* se sigue */ }
  if (L && parsearLRC(L.sincronizada).length) return L;
  try { const N = await letraNetEase(texto, s); if (N) return { ...N, plana: (L && L.plana) || "" }; } catch (_) { /* sin respaldo */ }
  return L;
}

/** Traduce una lista de líneas con el traductor gratuito de Google; devuelve una lista del mismo largo */
export async function traducir(texto, lineas, destino = "es") {
  const out = []; let i = 0;
  while (i < lineas.length) {
    const trozo = []; let largo = 0;
    while (i < lineas.length && largo < 1400) { const t = lineas[i] && lineas[i].trim() ? lineas[i] : "·"; trozo.push(t); largo += encodeURIComponent(t).length + 3; i++; }
    const j = await json(texto, `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${destino}&dt=t&q=${encodeURIComponent(trozo.join("\n"))}`);
    const todo = ((j && j[0]) || []).map((x) => x[0] || "").join(""), partes = todo.split("\n");
    for (let k = 0; k < trozo.length; k++) out.push(trozo[k] === "·" ? "" : partes.length === trozo.length ? partes[k].trim() : k === 0 ? todo : "");
  }
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
