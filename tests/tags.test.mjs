import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leerEtiquetas, desdeNombre } from "../app/js/tags.js";

const F = (n) => { const b = fs.readFileSync(new URL("./fixtures/" + n, import.meta.url)); return new File([b], n); };

test("FLAC: etiquetas, datos técnicos, duración, portada y ReplayGain", async () => {
  const t = await leerEtiquetas(F("prueba.flac"));
  assert.equal(t.titulo, "Canción de Prueba"); assert.equal(t.artista, "Banda Uno"); assert.equal(t.album, "Álbum Uno"); assert.equal(t.albumArtista, "Banda Uno");
  assert.equal(t.pista, 3); assert.equal(t.disco, 1); assert.equal(t.anio, 2021); assert.equal(t.genero, "Rock");
  assert.equal(t.formato, "FLAC"); assert.equal(t.sampleRate, 44100); assert.equal(t.canales, 1); assert.ok(t.bits >= 16);
  assert.ok(Math.abs(t.duracion - 1.5) < 0.05, "duración " + t.duracion);
  assert.equal(t.rg.pista, -6.5); assert.equal(t.rg.album, -5.25);
  assert.ok(t.portada && t.portada.size > 100 && t.portada.type === "image/png");
});
test("MP3: ID3v2.3, portada y duración estimada", async () => {
  const t = await leerEtiquetas(F("prueba.mp3"));
  assert.equal(t.titulo, "Tema MP3"); assert.equal(t.artista, "Banda Dos"); assert.equal(t.album, "Álbum Dos"); assert.equal(t.pista, 2); assert.equal(t.anio, 2019); assert.equal(t.genero, "Pop");
  assert.equal(t.formato, "MP3"); assert.equal(t.sampleRate, 44100);
  assert.ok(Math.abs(t.duracion - 1.5) < 0.25, "duración " + t.duracion);
  assert.ok(t.portada && t.portada.size > 100);
});
test("M4A: etiquetas ilst, portada, duración y frecuencia", async () => {
  const t = await leerEtiquetas(F("prueba.m4a"));
  assert.equal(t.titulo, "Pista M4A"); assert.equal(t.artista, "Banda Tres"); assert.equal(t.album, "Álbum Tres"); assert.equal(t.pista, 1); assert.equal(t.anio, 2020);
  assert.equal(t.sampleRate, 48000); assert.ok(Math.abs(t.duracion - 1.5) < 0.2, "duración " + t.duracion);
  assert.ok(t.portada && t.portada.size > 100);
});
test("OGG y WAV sin etiquetas: usan el nombre del archivo y no fallan", async () => {
  const o = await leerEtiquetas(F("prueba.ogg")); assert.equal(o.formato, "OGG"); assert.equal(o.titulo, "prueba");
  const w = await leerEtiquetas(F("sin_etiquetas.wav")); assert.equal(w.formato, "WAV"); assert.equal(w.titulo, "sin etiquetas"); assert.equal(w.portada, null);
});
test("nombre de archivo: «03 - Artista - Título», «Artista - Título», «07 Título»", () => {
  assert.deepEqual(desdeNombre("Queen - Bohemian Rhapsody.flac"), { artista: "Queen", titulo: "Bohemian Rhapsody", pista: null });
  assert.deepEqual(desdeNombre("03 - Queen - Under Pressure.mp3"), { artista: "Queen", titulo: "Under Pressure", pista: 3 });
  assert.deepEqual(desdeNombre("07 Sin Artista.m4a"), { artista: "", titulo: "Sin Artista", pista: 7 });
});
test("un archivo corrupto no lanza error", async () => {
  const t = await leerEtiquetas(new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43, 1, 2, 3])], "roto.flac"));
  assert.equal(t.titulo, "roto"); assert.equal(t.formato, "FLAC");
});
