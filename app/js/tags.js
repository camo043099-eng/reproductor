// Lector de etiquetas propio (sin librerías): FLAC, MP3 (ID3v2), M4A/MP4, y nombre de archivo como respaldo.
// Devuelve { titulo, artista, albumArtista, album, pista, disco, anio, genero, formato, sampleRate, bits, canales, duracion, rg, portada }.
// duracion en segundos (FLAC/M4A salen del archivo; MP3 se estima y la app la corrige con el reproductor); portada es un Blob o null.

const leer = async (f, ini, n) => new Uint8Array(await f.slice(ini, Math.min(f.size, ini + n)).arrayBuffer());
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = (b) => new TextDecoder("utf-8").decode(b);
const num = (s) => { const m = /^\s*(\d+)/.exec(String(s || "")); return m ? Number(m[1]) : null; };
const anio = (s) => { const m = /(\d{4})/.exec(String(s || "")); return m ? Number(m[1]) : null; };
const ganancia = (s) => { const m = /(-?\d+(?:[.,]\d+)?)/.exec(String(s || "")); return m ? Number(m[1].replace(",", ".")) : null; };

function vacio() {
  return { titulo: "", artista: "", albumArtista: "", album: "", pista: null, disco: null, anio: null, genero: "", formato: "", sampleRate: 0, bits: 0, canales: 0, duracion: 0, rg: { pista: null, album: null }, portada: null };
}

/** Respaldo: «Artista - Título.ext» o solo «Título.ext». */
export function desdeNombre(nombre) {
  const base = String(nombre).replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = /^(?:(\d{1,3})[\s.\-_]+)?(.+?)\s+-\s+(.+)$/.exec(base);
  if (m) return { artista: m[2].trim(), titulo: m[3].trim(), pista: m[1] ? Number(m[1]) : null };
  const n = /^(\d{1,3})[\s.\-_]+(.+)$/.exec(base);
  return n ? { artista: "", titulo: n[2].trim(), pista: Number(n[1]) } : { artista: "", titulo: base, pista: null };
}

// ── FLAC ──
async function flac(f, t) {
  t.formato = "FLAC";
  let pos = 4;
  for (let guarda = 0; guarda < 64 && pos + 4 <= f.size; guarda++) {
    const h = await leer(f, pos, 4), ultimo = h[0] & 0x80, tipo = h[0] & 0x7f, len = (h[1] << 16) | (h[2] << 8) | h[3];
    const b = await leer(f, pos + 4, len);
    if (tipo === 0 && b.length >= 18) {
      t.sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
      t.canales = ((b[12] >> 1) & 7) + 1;
      t.bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
      const total = (b[13] & 15) * 4294967296 + u32(b, 14);
      if (t.sampleRate) t.duracion = total / t.sampleRate;
    } else if (tipo === 4) {
      const vendor = u32le(b, 0); let o = 4 + vendor; const n = u32le(b, o); o += 4;
      const c = {};
      for (let i = 0; i < n && o + 4 <= b.length; i++) {
        const l = u32le(b, o); o += 4; const s = utf8(b.subarray(o, o + l)); o += l;
        const k = s.indexOf("="); if (k > 0) c[s.slice(0, k).toUpperCase()] = s.slice(k + 1);
      }
      aplicarComentarios(t, c);
    } else if (tipo === 6 && !t.portada) {
      let o = 4; const mimeL = u32(b, o); o += 4; const mime = utf8(b.subarray(o, o + mimeL)); o += mimeL;
      const descL = u32(b, o); o += 4 + descL + 16; const dl = u32(b, o); o += 4;
      if (dl > 0 && o + dl <= b.length) t.portada = new Blob([b.slice(o, o + dl)], { type: mime || "image/jpeg" });
    }
    pos += 4 + len;
    if (ultimo) break;
  }
}

function aplicarComentarios(t, c) {
  t.titulo = c.TITLE || t.titulo; t.artista = c.ARTIST || t.artista; t.albumArtista = c.ALBUMARTIST || c["ALBUM ARTIST"] || t.albumArtista;
  t.album = c.ALBUM || t.album; t.pista = num(c.TRACKNUMBER) ?? t.pista; t.disco = num(c.DISCNUMBER) ?? t.disco;
  t.anio = anio(c.DATE || c.YEAR) ?? t.anio; t.genero = c.GENRE || t.genero;
  t.rg.pista = ganancia(c.REPLAYGAIN_TRACK_GAIN) ?? t.rg.pista; t.rg.album = ganancia(c.REPLAYGAIN_ALBUM_GAIN) ?? t.rg.album;
}

// ── MP3 / ID3v2 ──
const sync = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
function texto(b, enc) {                                    // b sin el byte de codificación
  if (enc === 1 || enc === 2) {
    let big = enc === 2, i = 0;
    if (b[0] === 0xff && b[1] === 0xfe) { big = false; i = 2; } else if (b[0] === 0xfe && b[1] === 0xff) { big = true; i = 2; }
    return new TextDecoder(big ? "utf-16be" : "utf-16le").decode(b.subarray(i)).replace(/\0+$/, "");
  }
  return new TextDecoder(enc === 3 ? "utf-8" : "iso-8859-1").decode(b).replace(/\0+$/, "");
}
function finTexto(b, o, enc) {                              // posición del terminador desde o
  if (enc === 1 || enc === 2) { for (let i = o; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; }
  const i = b.indexOf(0, o); return i < 0 ? b.length : i;
}
async function mp3(f, t) {
  t.formato = "MP3";
  const cab = await leer(f, 0, 10); let audioIni = 0;
  if (cab[0] === 0x49 && cab[1] === 0x44 && cab[2] === 0x33) {
    const ver = cab[3], flags = cab[5], tam = sync(cab, 6); audioIni = 10 + tam;
    const b = await leer(f, 10, tam); let o = 0;
    if (flags & 0x40 && ver >= 3) { o = ver === 4 ? sync(b, 0) : u32(b, 0) + 4; }
    const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10, c = {};
    while (o + hLen <= b.length && b[o] !== 0) {
      const id = String.fromCharCode(...b.subarray(o, o + idLen));
      const tam2 = ver === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5] : ver === 4 ? sync(b, o + 4) : u32(b, o + 4);
      const d = b.subarray(o + hLen, o + hLen + tam2); o += hLen + tam2;
      if (!d.length) continue;
      const enc = d[0];
      if (id[0] === "T" && id !== "TXXX" && id !== "TXX") c[id] = texto(d.subarray(1), enc);
      else if (id === "TXXX" || id === "TXX") { const e = finTexto(d, 1, enc); c["TXXX:" + texto(d.subarray(1, e), enc).toUpperCase()] = texto(d.subarray(e + (enc === 1 || enc === 2 ? 2 : 1)), enc); }
      else if ((id === "APIC" || id === "PIC") && !t.portada) {
        let p = 1, mime;
        if (ver === 2) { mime = "image/" + String.fromCharCode(...d.subarray(1, 4)).toLowerCase().replace("jpg", "jpeg"); p = 4; }
        else { const e = d.indexOf(0, 1); mime = String.fromCharCode(...d.subarray(1, e)) || "image/jpeg"; p = e + 1; }
        p += 1; const e2 = finTexto(d, p, enc); p = e2 + (enc === 1 || enc === 2 ? 2 : 1);
        if (p < d.length) t.portada = new Blob([d.slice(p)], { type: mime.startsWith("image/") ? mime : "image/jpeg" });
      }
    }
    const pick = (...ks) => { for (const k of ks) if (c[k]) return c[k]; return ""; };
    t.titulo = pick("TIT2", "TT2"); t.artista = pick("TPE1", "TP1"); t.albumArtista = pick("TPE2", "TP2"); t.album = pick("TALB", "TAL");
    t.pista = num(pick("TRCK", "TRK")); t.disco = num(pick("TPOS", "TPA")); t.anio = anio(pick("TDRC", "TYER", "TYE", "TDAT"));
    t.genero = pick("TCON", "TCO").replace(/^\(\d+\)/, "");
    t.rg.pista = ganancia(c["TXXX:REPLAYGAIN_TRACK_GAIN"]); t.rg.album = ganancia(c["TXXX:REPLAYGAIN_ALBUM_GAIN"]);
  }
  // duración estimada: Xing/VBRI si existe; si no, tamaño / tasa de bits de la primera trama
  const a = await leer(f, audioIni, 4096);
  for (let i = 0; i + 4 < a.length; i++) {
    if (a[i] !== 0xff || (a[i + 1] & 0xe0) !== 0xe0) continue;
    const v = (a[i + 1] >> 3) & 3, l = (a[i + 1] >> 1) & 3, bi = a[i + 2] >> 4, si = (a[i + 2] >> 2) & 3;
    if (v === 1 || l === 0 || bi === 0 || bi === 15 || si === 3) continue;
    const mpeg1 = v === 3, srTab = [44100, 48000, 32000], sr = srTab[si] / (v === 3 ? 1 : v === 2 ? 2 : 4);
    const tasas = l === 3 ? (mpeg1 ? [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448] : [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256])
      : l === 2 ? (mpeg1 ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])
        : (mpeg1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]);
    const kbps = tasas[bi], mono = (a[i + 3] >> 6) === 3, sam = l === 3 ? 384 : (l === 2 || mpeg1) ? 1152 : 576;
    t.sampleRate = sr; t.canales = mono ? 1 : 2; t.bitrate = kbps;
    const xo = i + 4 + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    const tag = String.fromCharCode(...a.subarray(xo, xo + 4));
    if ((tag === "Xing" || tag === "Info") && a[xo + 7] & 1) { const tramas = u32(a, xo + 8); t.duracion = (tramas * sam) / sr; }
    else t.duracion = ((f.size - audioIni) * 8) / (kbps * 1000);
    break;
  }
}

// ── M4A / MP4 ──
async function mp4(f, t) {
  t.formato = "M4A";
  const caja = async (ini, fin) => {                         // lista las cajas entre ini y fin
    const sal = []; let p = ini;
    while (p + 8 <= fin) {
      const h = await leer(f, p, 16); let tam = u32(h, 0); const tipo = String.fromCharCode(...h.subarray(4, 8)); let cab = 8;
      if (tam === 1) { tam = u32(h, 8) * 4294967296 + u32(h, 12); cab = 16; } else if (tam === 0) tam = fin - p;
      if (tam < cab) break;
      sal.push({ tipo, ini: p + cab, fin: Math.min(p + tam, fin) }); p += tam;
    }
    return sal;
  };
  const moov = (await caja(0, f.size)).find((c) => c.tipo === "moov"); if (!moov) return;
  const hijos = await caja(moov.ini, moov.fin);
  const mvhd = hijos.find((c) => c.tipo === "mvhd");
  if (mvhd) { const b = await leer(f, mvhd.ini, 32); const v1 = b[0] === 1; const esc = v1 ? u32(b, 20) : u32(b, 12), dur = v1 ? u32(b, 24) * 4294967296 + u32(b, 28) : u32(b, 16); if (esc) t.duracion = dur / esc; }
  // sample rate y canales de la pista de audio (mp4a)
  try {
    const trak = hijos.filter((c) => c.tipo === "trak");
    for (const tk of trak) {
      const mdia = (await caja(tk.ini, tk.fin)).find((c) => c.tipo === "mdia"); if (!mdia) continue;
      const minf = (await caja(mdia.ini, mdia.fin)).find((c) => c.tipo === "minf"); if (!minf) continue;
      const stbl = (await caja(minf.ini, minf.fin)).find((c) => c.tipo === "stbl"); if (!stbl) continue;
      const stsd = (await caja(stbl.ini, stbl.fin)).find((c) => c.tipo === "stsd"); if (!stsd) continue;
      const b = await leer(f, stsd.ini, 64); const tipo = String.fromCharCode(...b.subarray(12, 16));
      if (tipo === "mp4a" || tipo === "alac" || tipo === "fLaC") { t.canales = (b[16 + 8 + 8 + 0 + 0] << 8 | b[16 + 8 + 9]) || 2; t.bits = (b[16 + 8 + 10] << 8 | b[16 + 8 + 11]) || 16; t.sampleRate = (b[16 + 8 + 16] << 8) | b[16 + 8 + 17]; if (tipo === "alac") t.formato = "ALAC"; break; }
    }
  } catch (_) { /* datos técnicos opcionales */ }
  const udta = hijos.find((c) => c.tipo === "udta"); if (!udta) return;
  const meta = (await caja(udta.ini, udta.fin)).find((c) => c.tipo === "meta"); if (!meta) return;
  const ilst = (await caja(meta.ini + 4, meta.fin)).find((c) => c.tipo === "ilst"); if (!ilst) return;
  for (const it of await caja(ilst.ini, ilst.fin)) {
    const d = (await caja(it.ini, it.fin)).find((c) => c.tipo === "data"); if (!d) continue;
    const b = await leer(f, d.ini, d.fin - d.ini), flag = u32(b, 0) & 0xffffff, carga = b.subarray(8), id = it.tipo;
    if (id === "covr") { if (!t.portada) t.portada = new Blob([carga.slice()], { type: flag === 14 ? "image/png" : "image/jpeg" }); continue; }
    if (id === "trkn") { t.pista = (carga[2] << 8) | carga[3]; continue; }
    if (id === "disk") { t.disco = (carga[2] << 8) | carga[3]; continue; }
    const s = utf8(carga);
    if (id === "\xA9nam") t.titulo = s; else if (id === "\xA9ART") t.artista = s; else if (id === "aART") t.albumArtista = s;
    else if (id === "\xA9alb") t.album = s; else if (id === "\xA9day") t.anio = anio(s); else if (id === "\xA9gen") t.genero = s;
  }
}

const EXT = { flac: "FLAC", mp3: "MP3", m4a: "M4A", mp4: "M4A", aac: "AAC", ogg: "OGG", oga: "OGG", opus: "OPUS", wav: "WAV", wma: "WMA", aiff: "AIFF", aif: "AIFF", alac: "ALAC", webm: "WEBM" };

/** Lee las etiquetas de un File. Nunca lanza: si algo falla, devuelve lo que se pudo más el nombre del archivo. */
export async function leerEtiquetas(file) {
  const t = vacio(), ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1]?.toLowerCase() || "";
  t.formato = EXT[ext] || ext.toUpperCase();
  try {
    const cab = await leer(file, 0, 12), s4 = String.fromCharCode(...cab.subarray(0, 4));
    if (s4 === "fLaC") await flac(file, t);
    else if (s4.startsWith("ID3") || (cab[0] === 0xff && (cab[1] & 0xe0) === 0xe0)) await mp3(file, t);
    else if (String.fromCharCode(...cab.subarray(4, 8)) === "ftyp") await mp4(file, t);
  } catch (_) { /* archivo raro: se usa el nombre */ }
  const n = desdeNombre(file.name);
  if (!t.titulo) t.titulo = n.titulo;
  if (!t.artista) t.artista = n.artista || t.albumArtista;
  if (t.pista == null) t.pista = n.pista;
  return t;
}
