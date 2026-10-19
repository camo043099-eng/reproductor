// Ecualizador avanzado: filtros paramétricos, curva de respuesta, importar perfiles AutoEQ / Equalizer APO.
// Mismas fórmulas que el motor nativo (Audio EQ Cookbook), para que la curva dibujada sea la que suena.

export const PICO = 0, GRAVE = 1, AGUDO = 2;
export const ISO31 = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
export const BANDAS10 = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const MAX_FILTROS = 32;
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

/** lista de filtros {f,g,q,t} para el gráfico de 10 o de 31 bandas */
export function filtrosGrafico(ganancias, n) {
  if (n === 31) return ISO31.map((f, i) => ({ f, g: ganancias[i] || 0, q: 4.32, t: PICO }));
  return BANDAS10.map((f, i) => ({ f, g: ganancias[i] || 0, q: 1.1, t: i === 0 ? GRAVE : i === 9 ? AGUDO : PICO }));
}

/** coeficientes normalizados de un filtro a la frecuencia de muestreo hz */
export function coef(fl, hz) {
  const A = Math.pow(10, fl.g / 40), w = 2 * Math.PI * fl.f / hz, cs = Math.cos(w), sn = Math.sin(w);
  let b0, b1, b2, a0, a1, a2;
  if (fl.t !== PICO) {
    const al = sn / 2 * Math.sqrt((A + 1 / A) * 0 + 2), r = 2 * Math.sqrt(A) * al;
    if (fl.t === GRAVE) { b0 = A * ((A + 1) - (A - 1) * cs + r); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - r); a0 = (A + 1) + (A - 1) * cs + r; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - r; }
    else { b0 = A * ((A + 1) + (A - 1) * cs + r); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - r); a0 = (A + 1) - (A - 1) * cs + r; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - r; }
  } else { const al = sn / (2 * fl.q); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** respuesta en dB a las frecuencias dadas (suma de todos los filtros, tono incluido) */
export function respuesta(filtros, freqs, { grave = 0, agudo = 0, hz = 48000 } = {}) {
  const todos = filtros.filter((x) => Math.abs(x.g) >= 0.01 && x.f < hz / 2);
  if (Math.abs(grave) >= 0.01) todos.push({ f: 120, g: grave, q: 0.7, t: GRAVE });
  if (Math.abs(agudo) >= 0.01) todos.push({ f: 6000, g: agudo, q: 0.7, t: AGUDO });
  const cs = todos.map((x) => coef(x, hz));
  return freqs.map((f) => {
    const w = 2 * Math.PI * f / hz, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w); let m2 = 1;
    for (const co of cs) { const nr = co[0] + co[1] * c1 + co[2] * c2, ni = -(co[1] * s1 + co[2] * s2), dr = 1 + co[3] * c1 + co[4] * c2, di = -(co[3] * s1 + co[4] * s2); m2 *= (nr * nr + ni * ni) / (dr * dr + di * di); }
    return 10 * Math.log10(m2);
  });
}

/** Lee un perfil en texto de AutoEQ / Equalizer APO:  "Preamp: -6.1 dB"  y  "Filter 1: ON PK Fc 105 Hz Gain 3.4 dB Q 0.70" */
export function leerAutoEQ(texto) {
  const filtros = []; let pre = 0, ignorados = 0;
  for (const linea of String(texto || "").split(/\r?\n/)) {
    const p = /^\s*preamp\s*:\s*(-?[\d.]+)\s*db/i.exec(linea); if (p) { pre = limitar(+p[1], -24, 12); continue; }
    const m = /filter\s*\d*\s*:\s*(on|off)\s+(\w+)\s+fc\s+(-?[\d.]+)\s*hz(?:\s+gain\s+(-?[\d.]+)\s*db)?(?:\s+q\s+([\d.]+))?/i.exec(linea); if (!m) continue;
    if (m[1].toLowerCase() === "off") continue;
    const tipo = m[2].toUpperCase(); const t = tipo === "PK" || tipo === "PEQ" ? PICO : /^LS/.test(tipo) ? GRAVE : /^HS/.test(tipo) ? AGUDO : -1;
    if (t < 0) { ignorados++; continue; }
    const q = m[5] ? +m[5] : 0.7;
    filtros.push({ f: limitar(+m[3], 15, 20000), g: limitar(+(m[4] || 0), -18, 18), q: limitar(q, 0.1, 18), t });
  }
  return { filtros: filtros.slice(0, MAX_FILTROS), pre, ignorados, recortados: Math.max(0, filtros.length - MAX_FILTROS) };
}

/** texto del perfil en el mismo formato (para exportar y compartir) */
export function aTextoAutoEQ(filtros, pre = 0) {
  return `Preamp: ${(+pre).toFixed(1)} dB\n` + filtros.map((x, i) => `Filter ${i + 1}: ON ${x.t === GRAVE ? "LSC" : x.t === AGUDO ? "HSC" : "PK"} Fc ${Math.round(x.f * 10) / 10} Hz Gain ${(+x.g).toFixed(1)} dB Q ${(+x.q).toFixed(2)}`).join("\n") + "\n";
}
