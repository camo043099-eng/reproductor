import test from "node:test"; import assert from "node:assert/strict";
import { traducir, buscarLetraCompleta } from "../app/js/internet.js";
test("traducir mantiene el largo y deja vacías las líneas vacías", async () => {
  const texto = async (u) => { const q = decodeURIComponent(new URL(u).searchParams.get("q")); return JSON.stringify([q.split("\n").map((l, i, a) => ["ES:" + l + (i < a.length - 1 ? "\n" : ""), l])]); };
  assert.deepEqual(await traducir(texto, ["hola", "", "adiós"]), ["ES:hola", "", "ES:adiós"]);
});
test("si LRCLIB no sincroniza, usa NetEase", async () => {
  const texto = async (u) => {
    if (u.includes("lrclib.net/api/get")) return JSON.stringify({ plainLyrics: "solo texto", syncedLyrics: "" });
    if (u.includes("lrclib.net/api/search")) return "[]";
    if (u.includes("search/get")) return JSON.stringify({ result: { songs: [{ id: 7, duration: 241000 }] } });
    if (u.includes("song/lyric")) return JSON.stringify({ lrc: { lyric: "[00:01.00]uno\n[00:05.00]dos" }, tlyric: { lyric: "[00:01.00]one" } });
    throw new Error(u);
  };
  const L = await buscarLetraCompleta(texto, { titulo: "Ode", artista: "A, B", duracion: 242 });
  assert.match(L.sincronizada, /uno/); assert.match(L.traduccion, /one/); assert.equal(L.plana, "solo texto");
});
import { variantes } from "../app/js/internet.js";
test("variantes separa título mezclado y quita número de pista", () => {
  const v = variantes({ titulo: "03 - Ode to the Nameless Martyr 致以无名的抗争者 (OST)", artista: "鳴潮, jixwang" });
  assert.ok(v.titulos.includes("Ode to the Nameless Martyr")); assert.ok(v.titulos.includes("致以无名的抗争者")); assert.equal(v.arts[0], "鳴潮");
});
import { buscarPortadaUrl, albumGenerico } from "../app/js/internet.js";
test("portada: un álbum genérico y sin artista no se empareja por nombre parcial", async () => {
  assert.ok(albumGenerico("Music") && albumGenerico("Download") && !albumGenerico("Unleashed"));
  const texto = async (u) => JSON.stringify(u.includes("entity=album") ? { results: [{ artistName: "Baby Lullaby Academy", collectionName: "Baby Sleep Music", artworkUrl100: "https://x/100x100bb.jpg" }] } : { results: [], data: [] });
  assert.equal(await buscarPortadaUrl(texto, { titulo: "Tenki no ko", artista: "", album: "Music", duracion: 408 }), null);
});

test("traducir: si Google falla usa MyMemory", async () => {
  const { traducir } = await import("../app/js/internet.js");
  const texto = async (u) => { if (u.includes("google")) throw new Error("http 429"); return JSON.stringify({ responseData: { translatedText: "hola " + decodeURIComponent(u.split("q=")[1]) } }); };
  const r = await traducir(texto, ["love", "", "you"], "es");
  assert.deepEqual(r, ["hola love", "", "hola you"]);
});

test("candidatasPortada: junta iTunes y Deezer sin repetir", async () => {
  const { candidatasPortada } = await import("../app/js/internet.js");
  const texto = async (u) => {
    if (u.includes("entity=song")) return JSON.stringify({ results: [{ artworkUrl100: "https://x/100x100bb.jpg", collectionName: "Disco A", artistName: "Ana" }] });
    if (u.includes("entity=album")) return JSON.stringify({ results: [{ artworkUrl100: "https://y/100x100bb.jpg", collectionName: "Disco A", artistName: "Ana" }, { artworkUrl100: "https://z/100x100bb.jpg", collectionName: "Disco B", artistName: "Ana" }] });
    return JSON.stringify({ data: [{ album: { cover_xl: "https://d/xl.jpg", cover_medium: "https://d/m.jpg", title: "Disco C" }, artist: { name: "Ana" } }] });
  };
  const r = await candidatasPortada(texto, "Ana Disco");
  assert.deepEqual(r.map((c) => c.titulo), ["Disco A", "Disco C", "Disco B"]);
  assert.ok(r[0].url.includes("1000x1000") && r[0].mini.includes("220x220"));
  assert.deepEqual(await candidatasPortada(texto, "  "), []);
});
