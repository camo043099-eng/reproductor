// Motor de reproducción: dos elementos <audio> (el siguiente se prepara mientras suena el actual, para pasar casi sin pausa),
// y una cadena Web Audio: ganancia ReplayGain → preamp → ecualizador de 10 bandas → analizador → salida.

export const BANDAS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const PRESETS = {
  Plano: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bajos: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Voces: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  Rock: [4, 3, 2, 0, -1, -1, 1, 3, 4, 5],
  Electrónica: [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
  Clásica: [0, 0, 0, 0, 0, 0, -2, -2, -2, -4],
  Agudos: [-2, -1, 0, 0, 0, 1, 3, 5, 6, 6],
};
const aLineal = (db) => Math.pow(10, db / 20);

export class Reproductor extends EventTarget {
  /** obtenerBlob(id) → Promise<Blob>; obtenerPortada(song) → Promise<Blob|null> (opcional) */
  constructor({ obtenerBlob, obtenerPortada } = {}) {
    super();
    this.obtenerBlob = obtenerBlob; this.obtenerPortada = obtenerPortada || (async () => null);
    this.els = [new Audio(), new Audio()]; this.act = 0; this.urls = [null, null]; this.cargados = [null, null];
    for (const e of this.els) { e.preload = "auto"; e.crossOrigin = "anonymous"; }
    this.cola = []; this.orden = []; this.pos = -1;                // cola: canciones; orden: índices de la cola en el orden de reproducción
    this.aleatorio = false; this.repetir = "no";                   // no | todo | uno
    this.rgModo = "pista"; this.preampDb = 0; this.eqOn = true; this.bandasDb = PRESETS.Plano.slice(); this.velocidad = 1;
    this.volumen = 1; this.ctx = null; this.hz = 0; this.duracionMin = 0;
    this._sueno = null; this._finCancion = false; this._cambiando = false;
    for (let i = 0; i < 2; i++) {
      const e = this.els[i];
      e.addEventListener("timeupdate", () => { if (i === this.act) this._emitir("tiempo"); });
      e.addEventListener("ended", () => { if (i === this.act) this._terminada(); });
      e.addEventListener("play", () => { if (i === this.act) this._emitir("estado"); });
      e.addEventListener("pause", () => { if (i === this.act && !this._cambiando) this._emitir("estado"); });
      e.addEventListener("loadedmetadata", () => { if (i === this.act && isFinite(e.duration)) this._emitir("tiempo"); });
      e.addEventListener("error", () => { if (i === this.act && e.src) this._emitir("error", { mensaje: "No pude reproducir esta canción." }); });
    }
    this._tic = setInterval(() => this._vigilar(), 50);
  }

  _emitir(tipo, detalle) { this.dispatchEvent(new CustomEvent(tipo, { detail: detalle })); }

  // ── cadena de audio (se crea con el primer toque, porque el navegador lo exige) ──
  _audio() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext; this.ctx = new Ctx({ latencyHint: "playback" });
    this.rgNodos = this.els.map((e) => { const s = this.ctx.createMediaElementSource(e), g = this.ctx.createGain(); s.connect(g); return g; });
    this.mezcla = this.ctx.createGain(); this.rgNodos.forEach((g) => g.connect(this.mezcla));
    this.pre = this.ctx.createGain(); this.mezcla.connect(this.pre);
    this.filtros = BANDAS.map((f, i) => { const b = this.ctx.createBiquadFilter(); b.type = i === 0 ? "lowshelf" : i === BANDAS.length - 1 ? "highshelf" : "peaking"; b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0; return b; });
    this.analizador = this.ctx.createAnalyser(); this.analizador.fftSize = 256; this.analizador.smoothingTimeConstant = 0.8;
    this.salida = this.ctx.createGain();
    this._conectar(); this.aplicarEq(); this.aplicarPreamp(); this._aplicarRG(0); this._aplicarRG(1);
    this.hz = this.ctx.sampleRate;
  }
  _conectar() {
    this.pre.disconnect(); this.filtros.forEach((f) => f.disconnect());
    let ant = this.pre; if (this.eqOn) for (const f of this.filtros) { ant.connect(f); ant = f; }
    ant.connect(this.analizador); this.analizador.connect(this.salida); this.salida.connect(this.ctx.destination);
  }
  aplicarEq() { if (!this.ctx) return; this.filtros.forEach((f, i) => { f.gain.value = this.bandasDb[i] || 0; }); this._conectar(); this._margen(); }
  /** margen automático: se baja lo que el ecualizador sube como máximo para que los picos no se recorten */
  _margen() {
    let max = 0;
    if (this.eqOn && this.filtros?.length && this.bandasDb.some((v) => v)) {
      const n = 160, fr = new Float32Array(n), mag = new Float32Array(n), fase = new Float32Array(n), tot = new Float32Array(n).fill(1);
      for (let k = 0; k < n; k++) fr[k] = Math.min(20 * Math.pow(1000, k / (n - 1)), this.ctx.sampleRate / 2 - 1);
      for (const f of this.filtros) { f.getFrequencyResponse(fr, mag, fase); for (let k = 0; k < n; k++) tot[k] *= mag[k]; }
      for (let k = 0; k < n; k++) max = Math.max(max, 20 * Math.log10(tot[k]));
    }
    this._comp = Math.min(9, max); this.aplicarPreamp();
  }
  aplicarPreamp() { if (this.pre) this.pre.gain.value = aLineal(this.preampDb - (this._comp || 0)); }
  ajustarBanda(i, db) { this.bandasDb[i] = Math.max(-12, Math.min(12, db)); this.aplicarEq(); }
  usarPreset(nombre) { if (PRESETS[nombre]) { this.bandasDb = PRESETS[nombre].slice(); this.aplicarEq(); } }
  activarEq(v) { this.eqOn = !!v; if (this.ctx) { this._conectar(); this._margen(); } }
  ponerPreamp(db) { this.preampDb = Math.max(-12, Math.min(12, db)); this.aplicarPreamp(); }
  ponerVolumen(v) { this.volumen = Math.max(0, Math.min(1, v)); for (const e of this.els) e.volume = this.volumen; }
  ponerVelocidad(v) { this.velocidad = v; for (const e of this.els) { e.playbackRate = v; e.preservesPitch = true; } }
  ponerRG(modo) { this.rgModo = modo; this._aplicarRG(0); this._aplicarRG(1); }
  /** ganancia dB que se aplica a una canción según el modo (álbum, pista o nada) */
  gananciaDe(s) {
    if (!s || this.rgModo === "off" || !s.rg) return 0;
    const db = this.rgModo === "album" ? (s.rg.album ?? s.rg.pista) : (s.rg.pista ?? s.rg.album);
    return db == null ? 0 : Math.min(db, 3);                            // sin conocer el pico, nunca se sube más de +3 dB
  }
  _aplicarRG(i) { if (this.rgNodos) this.rgNodos[i].gain.value = aLineal(this.gananciaDe(this.cargados[i])); }

  // ── cola ──
  get actual() { return this.pos >= 0 ? this.cola[this.orden[this.pos]] : null; }
  get el() { return this.els[this.act]; }
  get tiempo() { return this.el.currentTime || 0; }
  get duracion() { const d = this.el.duration; return isFinite(d) && d > 0 ? d : (this.actual?.duracion || 0); }
  get sonando() { return !this.el.paused && !this.el.ended; }

  _armarOrden(primero) {
    const n = this.cola.length, idx = [...Array(n).keys()];
    if (this.aleatorio) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      if (primero != null) { const k = idx.indexOf(primero); [idx[0], idx[k]] = [idx[k], idx[0]]; }
    }
    this.orden = idx; this.pos = primero == null ? -1 : this.orden.indexOf(primero);
  }
  /** Reemplaza la cola y empieza en `indice` (si `sonar` es falso solo la deja lista). */
  async cargarCola(canciones, indice = 0, sonar = true) {
    this.cola = canciones.slice(); this._armarOrden(indice);
    return this._poner(this.pos, sonar);
  }
  async _poner(pos, sonar = true, desde = 0) {
    if (pos < 0 || pos >= this.orden.length) return;
    this._audio(); this.pos = pos; const s = this.actual;
    this._cambiando = true; this.el.pause();
    const i = this.act;
    if (this.cargados[i]?.id !== s.id || !this.urls[i]) await this._cargar(i, s);
    this._aplicarRG(i); this.el.currentTime = desde; this.ponerVelocidad(this.velocidad);
    this._cambiando = false; this._emitir("cambio", s); this._sesion(s);
    if (sonar) { try { await this.el.play(); } catch (_) { /* el navegador pidió un toque */ } }
    this._emitir("estado"); this._precargar();
  }
  async _cargar(i, s) {
    const blob = await this.obtenerBlob(s.id); if (!blob) throw new Error("falta el archivo");
    if (this.urls[i]) URL.revokeObjectURL(this.urls[i]);
    this.urls[i] = URL.createObjectURL(blob); this.els[i].src = this.urls[i]; this.cargados[i] = s;
    await new Promise((ok) => { const f = () => { this.els[i].removeEventListener("loadedmetadata", f); this.els[i].removeEventListener("error", f); ok(); }; this.els[i].addEventListener("loadedmetadata", f); this.els[i].addEventListener("error", f); setTimeout(ok, 4000); });
    if (isFinite(this.els[i].duration) && this.els[i].duration > 0) this._emitir("duracion", { id: s.id, duracion: this.els[i].duration });
  }
  _siguientePos() {
    if (this.repetir === "uno") return this.pos;
    if (this.pos + 1 < this.orden.length) return this.pos + 1;
    return this.repetir === "todo" ? 0 : -1;
  }
  async _precargar() {
    const p = this._siguientePos(), o = 1 - this.act; this._listo = false;
    if (p < 0 || p === this.pos && this.repetir !== "uno") return;
    if (this.repetir === "uno") return;                                  // repetir una: se vuelve a poner la misma
    const s = this.cola[this.orden[p]];
    try { await this._cargar(o, s); this._aplicarRG(o); this.els[o].currentTime = 0; this._listo = this.cargados[o]?.id === s.id; } catch (_) { this._listo = false; }
  }
  _vigilar() {
    if (!this.sonando) return;
    const rest = this.duracion - this.tiempo;
    if (this._listo && !this._finCancion && rest > 0 && rest <= 0.06 && this._siguientePos() >= 0) this._saltar();
  }
  _saltar() {                                                              // pasa al elemento ya preparado
    const p = this._siguientePos(), o = 1 - this.act; if (!this._listo || p < 0) return;
    this._cambiando = true; const viejo = this.els[this.act];
    this.act = o; this.pos = p; this.ponerVelocidad(this.velocidad);
    this.els[o].play().catch(() => {}); viejo.pause(); this._cambiando = false;
    this._emitir("cambio", this.actual); this._sesion(this.actual); this._emitir("estado"); this._precargar();
  }
  _terminada() {
    if (this._finCancion) { this._finCancion = false; this.el.pause(); this._emitir("dormido"); return; }
    if (this.repetir === "uno") { this.el.currentTime = 0; this.el.play(); return; }
    const p = this._siguientePos();
    if (p < 0) { this._emitir("estado"); return; }
    if (this._listo) this._saltar(); else this._poner(p, true);
  }
  async siguiente() { const p = this.pos + 1 < this.orden.length ? this.pos + 1 : (this.repetir === "todo" || this.orden.length ? 0 : -1); if (p >= 0) return this._poner(p, true); }
  async anterior() {
    if (this.tiempo > 3 || this.pos <= 0) { this.el.currentTime = 0; return; }
    return this._poner(this.pos - 1, true);
  }
  async irA(posCola) { const p = this.orden.indexOf(posCola); if (p >= 0) return this._poner(p, true); }
  alternar() { this._audio(); if (!this.actual) return; if (this.el.paused) return this.el.play(); this.el.pause(); }
  pausa() { this.el.pause(); }
  buscar(seg) { if (this.actual) this.el.currentTime = Math.max(0, Math.min(seg, this.duracion || seg)); }
  ponerAleatorio(v) { this.aleatorio = !!v; const cur = this.pos >= 0 ? this.orden[this.pos] : null; this._armarOrden(cur); this._precargar(); }
  ponerRepetir(m) { this.repetir = m; this._precargar(); }
  /** pone una canción justo después de la actual */
  siguienteLuego(s) { this._insertar(s, this.pos + 1); }
  alFinal(s) { this._insertar(s, this.orden.length); }
  _insertar(s, posOrden) {
    const idx = this.cola.push(s) - 1; this.orden.splice(Math.min(posOrden, this.orden.length), 0, idx);
    this._emitir("cola"); this._precargar();
  }
  quitarDeCola(posOrden) {
    if (posOrden === this.pos) return; const idx = this.orden[posOrden];
    this.orden.splice(posOrden, 1); this.orden = this.orden.map((i) => (i > idx ? i - 1 : i)); this.cola.splice(idx, 1);
    if (posOrden < this.pos) this.pos--; this._emitir("cola"); this._precargar();
  }
  mover(posOrden, delta) {
    const n = posOrden + delta; if (n < 0 || n >= this.orden.length) return;
    [this.orden[posOrden], this.orden[n]] = [this.orden[n], this.orden[posOrden]];
    if (this.pos === posOrden) this.pos = n; else if (this.pos === n) this.pos = posOrden;
    this._emitir("cola"); this._precargar();
  }
  listaEnOrden() { return this.orden.map((i) => this.cola[i]); }

  // ── temporizador de sueño ──
  dormir(minutos) {
    clearTimeout(this._sueno); this._finCancion = false; this._dormirEn = 0;
    if (minutos === "cancion") { this._finCancion = true; this._emitir("sueno"); return; }
    if (!minutos) { this._emitir("sueno"); return; }
    this._dormirEn = Date.now() + minutos * 60000;
    this._sueno = setTimeout(() => this._apagarSuave(), minutos * 60000); this._emitir("sueno");
  }
  get dormirRestante() { return this._dormirEn ? Math.max(0, this._dormirEn - Date.now()) : 0; }
  _apagarSuave() {
    const g = this.salida?.gain, ctx = this.ctx; this._dormirEn = 0;
    if (g && ctx) { g.setValueAtTime(g.value, ctx.currentTime); g.linearRampToValueAtTime(0.0001, ctx.currentTime + 6); }
    setTimeout(() => { this.el.pause(); if (g && ctx) g.setValueAtTime(1, ctx.currentTime); this._emitir("dormido"); }, g ? 6200 : 0);
  }

  // ── pantalla de bloqueo / notificación ──
  async _sesion(s) {
    if (!("mediaSession" in navigator) || !s) return;
    let arte = [];
    try { const b = await this.obtenerPortada(s); if (b) { if (this._urlArte) URL.revokeObjectURL(this._urlArte); this._urlArte = URL.createObjectURL(b); arte = [{ src: this._urlArte, sizes: "512x512", type: b.type || "image/jpeg" }]; } } catch (_) { /* sin portada */ }
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.titulo || "", artist: s.artista || "", album: s.album || "", artwork: arte });
  }
  instalarControlesSistema() {
    if (!("mediaSession" in navigator)) return;
    const a = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch (_) { /* no soportado */ } };
    a("play", () => this.alternar()); a("pause", () => this.pausa()); a("previoustrack", () => this.anterior()); a("nexttrack", () => this.siguiente());
    a("seekto", (d) => this.buscar(d.seekTime)); a("seekbackward", () => this.buscar(this.tiempo - 10)); a("seekforward", () => this.buscar(this.tiempo + 10));
    this.addEventListener("tiempo", () => { try { if (this.duracion) navigator.mediaSession.setPositionState({ duration: this.duracion, position: Math.min(this.tiempo, this.duracion), playbackRate: this.velocidad }); } catch (_) { /* opcional */ } });
    this.addEventListener("estado", () => { navigator.mediaSession.playbackState = this.sonando ? "playing" : "paused"; });
  }
  espectro(destino) { if (!this.analizador) return false; this.analizador.getByteFrequencyData(destino); return true; }
}
