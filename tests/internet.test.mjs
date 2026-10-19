import test from "node:test";
import assert from "node:assert/strict";
import { buscarPortadaUrl, buscarLetra, parsearLRC, lineaActual } from "../app/js/internet.js";

const falso = (mapa) => async (url) => { for (const [k, v] of Object.entries(mapa)) if (url.includes(k)) { if (v instanceof Error) throw v; return JSON.stringify(v); } throw new Error("404 " + url); };

test("portada: elige el álbum que coincide en artista y nombre y pide tamaño grande", async () => {
  const t = falso({ "entity=album": { results: [{ artistName: "Otro", collectionName: "Against the Tide (Deluxe)", artworkUrl100: "https://is1.mzstatic.com/a/100x100bb.jpg" }, { artistName: "鳴潮 & Forts", collectionName: "Against the Tide", artworkUrl100: "https://is1.mzstatic.com/b/100x100bb.jpg" }] } });
  assert.equal(await buscarPortadaUrl(t, { artista: "鳴潮 & Forts", album: "Against the Tide", titulo: "x" }), "https://is1.mzstatic.com/b/1000x1000bb.jpg");
});
test("portada: no acepta un álbum que no coincide y prueba la canción y luego Deezer", async () => {
  const t = falso({ "entity=album": { results: [{ artistName: "Alguien", collectionName: "Otra cosa", artworkUrl100: "https://x/100x100bb.jpg" }] }, "entity=song": new Error("sin red"), "api.deezer.com": { data: [{ title: "Mi Disco", artist: { name: "Banda" }, cover_xl: "https://cdn/dz.jpg" }] } });
  assert.equal(await buscarPortadaUrl(t, { artista: "Banda", album: "Mi Disco", titulo: "Tema" }), "https://cdn/dz.jpg");
  assert.equal(await buscarPortadaUrl(falso({}), { artista: "Nadie", album: "Nada", titulo: "Nunca" }), null);
});
test("portada sin álbum: busca por canción", async () => {
  const t = falso({ "entity=song": { results: [{ trackName: "Tema (Remix)", artistName: "Banda", artworkUrl100: "https://x/60x60bb.jpg" }] } });
  assert.equal(await buscarPortadaUrl(t, { artista: "Banda", titulo: "Tema" }), "https://x/1000x1000bb.jpg");
});
test("letra: usa la coincidencia exacta o la búsqueda con duración parecida", async () => {
  const exacta = falso({ "lrclib.net/api/get": { syncedLyrics: "[00:01.00] hola", plainLyrics: "hola" } });
  assert.deepEqual(await buscarLetra(exacta, { artista: "A", titulo: "T", duracion: 100 }), { sincronizada: "[00:01.00] hola", plana: "hola" });
  const busca = falso({ "api/get": new Error("404"), "api/search": [{ trackName: "T", duration: 300, plainLyrics: "lejana" }, { trackName: "T", duration: 101, syncedLyrics: "[00:02.00] cerca" }] });
  assert.equal((await buscarLetra(busca, { artista: "A", titulo: "T", duracion: 100 })).sincronizada, "[00:02.00] cerca");
  assert.equal(await buscarLetra(falso({ "api/get": new Error("x"), "api/search": [] }), { artista: "A", titulo: "T", duracion: 100 }), null);
});
test("LRC: interpreta tiempos, varias marcas por línea y busca la línea actual", () => {
  const l = parsearLRC("[ar:x]\n[00:10.50] uno\n[00:05.00][01:00.00] dos\n\n[00:20.00]");
  assert.deepEqual(l.map((x) => [x.t, x.txt]), [[5, "dos"], [10.5, "uno"], [20, ""], [60, "dos"]]);
  assert.equal(lineaActual(l, 1), -1); assert.equal(lineaActual(l, 5), 0); assert.equal(lineaActual(l, 12), 1); assert.equal(lineaActual(l, 999), 3);
});
