const V = "onda-v0.9.103";
const SHELL = ["./", "index.html", "styles.css", "manifest.webmanifest", "js/main.js", "js/player.js", "js/tags.js", "js/db.js", "js/nativo.js", "js/gestos.js", "js/internet.js", "js/recomendador.js", "js/eqpro.js", "fonts/GoogleSansFlex.ttf", "fonts/InterVariable.ttf", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icono-onda.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== V).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
