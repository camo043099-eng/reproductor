// Reproductor para la app Android: el audio lo mueve ExoPlayer (motor nativo); aquí solo se guarda la cola y se avisa a la pantalla.
// Tiene los mismos métodos y eventos que el reproductor web (player.js), así la interfaz no cambia.

import { BANDAS, PRESETS } from "./player.js";
import { filtrosGrafico } from "./eqpro.js";

const barajar = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dato = (s) => ({ id: s.id, uri: s.uri, titulo: s.titulo || s.nombre || "", artista: s.artista || "", album: s.album || "", albumId: s.portadaId || s.albumId || "" });

export class ReproductorNativo extends EventTarget {
  constructor(N) {
    super(); this.N = N; this.nativo = true;
    this.lista = []; this.original = []; this.pos = -1;
    this.aleatorio = false; this.repetir = "no"; this.rgModo = "pista"; this.preampDb = 0; this.eqOn = true; this.eqModo = "grafico"; this.eqNb = 10; this.g31 = new Array(31).fill(0); this.filtros = []; this.grave = 0; this.agudo = 0; this.bal = 0; this.bandasDb = PRESETS.Plano.slice(); this.velocidad = 1; this.volumen = 1; this.ancho = 0; this.env = 0; this.graves = 0;
    this.letras = {}; this.ruta = "altavoz";
    this._pos = 0; this._dur = 0; this._sonando = false; this._dormirEn = 0; this._tSueno = null;
    const on = (n, f) => N.addListener(n, f);
    on("tiempo", (e) => { const nuevo = e.pos / 1000, est = this._sonando && this._posAt ? this._pos + ((performance.now() - this._posAt) / 1000) * (this.velocidad || 1) : nuevo, dif = nuevo - est; this._pos = Math.abs(dif) < 1.5 && Math.abs(dif) > 0.02 ? est + dif * 0.35 : nuevo; this._posAt = performance.now(); if (e.dur > 0) this._dur = e.dur / 1000; this._emitir("tiempo"); });
    on("estado", (e) => { this._sonando = !!e.sonando; this._pos = e.pos / 1000; this._posAt = performance.now(); if (e.dur > 0) this._dur = e.dur / 1000; this._emitir("estado"); });
    on("cambio", (e) => { if (e.indice >= 0 && e.indice < this.lista.length) { this.pos = e.indice; this._pos = 0; this._dur = this.actual?.duracion || 0; this._emitir("cambio", this.actual); } });
    on("detalles", (e) => { const s = this.lista.find((x) => x.id === e.id); if (!s) return; if (e.sampleRate) s.sampleRate = e.sampleRate; if (e.bits) s.bits = e.bits; if (e.canales) s.canales = e.canales; if (e.bitrate) s.bitrate = e.bitrate; this._emitir("detalles", s); });
    on("error", (e) => this._emitir("error", { mensaje: e.mensaje }));
    on("nivel", (e) => { (this._cola ||= []).push({ t: performance.now(), b: e.b, r: e.r, x: e.x }); if (this._cola.length > 80) this._cola.shift(); });
    on("ruta", (e) => { this.ruta = e.tipo; this._emitir("ruta", e.tipo); });
    on("letra", (e) => { this.letras[e.id] = e.texto; this._emitir("letra", e.id); });
    on("dormido", () => { this._dormirEn = 0; this._sonando = false; this._emitir("dormido"); this._emitir("estado"); });
  }
  _emitir(tipo, detalle) { this.dispatchEvent(new CustomEvent(tipo, { detail: detalle })); }

  get actual() { return this.pos >= 0 ? this.lista[this.pos] || null : null; }
  get orden() { return this.lista.map((_, i) => i); }
  get cola() { return this.lista; }
  get tiempo() { return this._pos; }
  /** posición estimada ahora mismo: el motor avisa cada ~0,25 s, entre aviso y aviso se avanza con el reloj (para la letra) */
  get tiempoEst() { return this._sonando && this._posAt ? this._pos + ((performance.now() - this._posAt) / 1000) * (this.velocidad || 1) : this._pos; }
  get duracion() { return this._dur || this.actual?.duracion || 0; }
  get sonando() { return this._sonando; }
  get dormirRestante() { return this._dormirEn ? Math.max(0, this._dormirEn - Date.now()) : 0; }
  listaEnOrden() { return this.lista; }
  instalarControlesSistema() { /* la notificación y la pantalla de bloqueo las maneja el servicio nativo */ }
  espectro() { return false; }
  /** nivel de graves/total (0..1) enviado por el motor, con pequeño retraso para coincidir con lo que se oye */
  ponerRitmo(on) { this._ritmo = !!on; return this.N.ritmo({ on: !!on }); }
  infoAudio() { return this.N.infoAudio(); }
  ponerAlCerrar(detener) { return this.N.alCerrar({ detener: !!detener }); }
  ponerRealce(mezcla) { return this.N.realce({ mezcla }); }
  ponerHiRes(on) { return this.N.hiResPuro({ on: !!on }); }
  reiniciarNivel() { this._cola = []; this._ult = null; }
  nivel(lat = 260) { const q = this._cola || [], t = performance.now() - lat; let v = null; while (q.length && q[0].t <= t) v = q.shift(); if (v) this._ult = v; return this._ult || { b: 0, r: 0, x: [0, 0, 0, 0, 0, 0, 0, 0] }; }

  /** Reemplaza la cola y empieza en `indice`. Con `sonar` falso solo la deja lista. */
  async cargarCola(canciones, indice = 0, sonar = true, posMs = 0) {
    this.original = canciones.slice(); let lista = canciones.slice(), pos = indice;
    if (this.aleatorio && lista.length > 1) { const cur = lista[indice]; lista = [cur, ...barajar(lista.filter((_, k) => k !== indice))]; pos = 0; }
    this.lista = lista; this.pos = pos; this._pos = posMs / 1000; this._dur = this.actual?.duracion || 0;
    await this.N.cargar({ items: lista.map(dato), indice: pos, sonar, posMs });
    this._emitir("cola"); this._emitir("cambio", this.actual); this._sonando = sonar; this._emitir("estado");
  }
  async sincronizar(canciones, e) {                                    // la app se abrió y el motor ya estaba tocando
    this.lista = canciones; this.original = canciones.slice(); this.pos = e.indice; this._pos = e.pos / 1000; this._sonando = !!e.sonando; this._dur = e.dur > 0 ? e.dur / 1000 : this.actual?.duracion || 0;
    this._emitir("cola"); this._emitir("cambio", this.actual); this._emitir("estado");
  }
  alternar() { this._sonando = !this._sonando; this._posAt = performance.now(); this._emitir("estado"); return this.N.alternar(); }
  pausa() { return this.N.pausa(); }
  siguiente() { return this.N.siguiente(); }
  anterior() { return this.N.anterior(); }
  irA(i) { return this.N.irA({ indice: i }); }
  buscar(seg) { this._pos = Math.max(0, seg); this._posAt = performance.now(); this.N.buscar({ ms: Math.round(Math.max(0, seg) * 1000) }); this._emitir("tiempo"); }

  ponerAleatorio(v) {
    v = !!v; if (v === this.aleatorio) return; this.aleatorio = v;
    const cur = this.actual; if (!cur || this.lista.length < 2) return;
    let lista, pos;
    if (v) { lista = [cur, ...barajar(this.lista.filter((s) => s !== cur))]; pos = 0; }
    else { lista = this.original.filter((s) => this.lista.includes(s)); for (const s of this.lista) if (!lista.includes(s)) lista.push(s); pos = Math.max(0, lista.indexOf(cur)); }
    this.lista = lista; this.pos = pos; this.N.reordenar({ items: lista.map(dato), indice: pos }); this._emitir("cola");
  }
  ponerRepetir(m) { this.repetir = m; this.N.repetir({ modo: m }); }
  siguienteLuego(s) { this._insertar(s, this.pos + 1); }
  alFinal(s) { this._insertar(s, this.lista.length); }
  _insertar(s, i) { i = Math.min(i, this.lista.length); this.lista.splice(i, 0, s); this.N.insertar({ indice: i, item: dato(s) }); this._emitir("cola"); }
  quitarDeCola(i) {
    if (i === this.pos || i < 0 || i >= this.lista.length) return; this.lista.splice(i, 1); if (i < this.pos) this.pos--;
    this.N.quitar({ indice: i }); this._emitir("cola");
  }
  mover(i, delta) {
    const n = i + delta; if (n < 0 || n >= this.lista.length) return;
    [this.lista[i], this.lista[n]] = [this.lista[n], this.lista[i]];
    if (this.pos === i) this.pos = n; else if (this.pos === n) this.pos = i;
    this.N.mover({ de: i, a: n }); this._emitir("cola");
  }

  // ── sonido ──
  _eq() {
    const base = { on: this.eqOn, pre: this.preampDb, grave: this.grave, agudo: this.agudo, bal: this.bal }, fl = (l) => l.map((x) => [x.f, x.g, x.q, x.t]);
    if (this.eqModo === "param") this.N.eq(this.filtros.length ? { ...base, filtros: fl(this.filtros) } : { ...base, bandas: new Array(10).fill(0) });
    else if (this.eqNb === 31) this.N.eq({ ...base, filtros: fl(filtrosGrafico(this.g31, 31)) });
    else this.N.eq({ ...base, bandas: this.bandasDb });
  }
  ajustarBanda31(i, db) { this.g31[i] = Math.max(-12, Math.min(12, db)); this._eq(); }
  ponerModoEq(m, nb) { this.eqModo = m === "param" ? "param" : "grafico"; if (nb) this.eqNb = nb === 31 ? 31 : 10; this._eq(); }
  ponerFiltros(l) { this.filtros = l.slice(0, 32); this._eq(); }
  ponerTono(grave, agudo, bal) { this.grave = grave; this.agudo = agudo; this.bal = bal; this._eq(); }
  /** todo el estado del ecualizador (para guardar, exportar y perfiles por salida) */
  estadoEq() { return { modo: this.eqModo, nb: this.eqNb, b: this.bandasDb.slice(), g31: this.g31.slice(), f: this.filtros.map((x) => ({ ...x })), grave: this.grave, agudo: this.agudo, bal: this.bal, p: this.preampDb }; }
  cargarEstadoEq(o) {
    if (!o) return; this.eqModo = o.modo === "param" ? "param" : "grafico"; this.eqNb = o.nb === 31 ? 31 : 10;
    if (o.b?.length === 10) this.bandasDb = o.b.slice(); if (o.g31?.length === 31) this.g31 = o.g31.slice(); this.filtros = (o.f || []).slice(0, 32);
    this.grave = o.grave || 0; this.agudo = o.agudo || 0; this.bal = o.bal || 0; if (o.p != null) this.preampDb = o.p; this._eq();
  }
  ajustarBanda(i, db) { this.bandasDb[i] = Math.max(-12, Math.min(12, db)); this._eq(); }
  usarPreset(n) { if (PRESETS[n]) { this.bandasDb = PRESETS[n].slice(); this._eq(); } }
  activarEq(v) { this.eqOn = !!v; this._eq(); }
  ponerPreamp(db) { this.preampDb = Math.max(-12, Math.min(12, db)); this._eq(); }
  ponerVelocidad(v) { this.velocidad = v; this.N.velocidad({ v }); }
  ponerRG(m) { this.rgModo = m; this.N.rg({ modo: m }); }
  ponerVolumen() { /* el volumen lo controlan los botones del teléfono */ }
  ponerEspacial() { return this.N.espacial({ ancho: this.ancho / 100, env: Math.round(this.env * 10), graves: Math.round(this.graves * 10) }); }
  salidas() { return this.N.salidas(); }
  ponerSalida(s) { return this.N.salida(s ? { tipo: s.tipo, nombre: s.nombre || "" } : { tipo: -1 }); }
  capacidades() { return this.N.capacidades(); }
  efectosSistema() { return this.N.efectosSistema(); }
  /** al volver a la app: pregunta al motor cómo va (por si no llegaron avisos mientras estaba en segundo plano) */
  async resincronizar() {
    try {
      const e = await this.N.estado(); if (!e.ids?.length) return;
      this._sonando = !!e.sonando; this._pos = e.pos / 1000; if (e.dur > 0) this._dur = e.dur / 1000;
      if (e.indice >= 0 && e.indice < this.lista.length && e.indice !== this.pos) { this.pos = e.indice; this._emitir("cambio", this.actual); }
      this._emitir("estado"); this._emitir("tiempo");
    } catch (_) { /* sin respuesta */ }
  }
  ponerFundido(seg) { return this.N.fundido({ seg }); }
  escucharRuta() { return this.N.rutaEscuchar(); }
  ponerAvanzado(o) { return this.N.avanzado(o); }
  aplicarTodo() { this.ponerEspacial(); this._eq(); this.N.rg({ modo: this.rgModo }); this.N.velocidad({ v: this.velocidad }); this.N.repetir({ modo: this.repetir }); }

  dormir(minutos) {
    clearTimeout(this._tSueno); this._dormirEn = 0;
    if (minutos === "cancion") { this.N.dormir({ cancion: true }); this._emitir("sueno"); return; }
    this.N.dormir({ minutos: minutos || 0 });
    if (minutos) this._dormirEn = Date.now() + minutos * 60000;
    this._emitir("sueno");
  }
}
export { BANDAS };
