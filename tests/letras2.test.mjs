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
