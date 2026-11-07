// Bienvenida de la primera apertura. Sin acceso a window/document en el nivel superior (se prueba en Node).
// La pantalla no decide nada: al terminar avisa con el evento «onda:bienvenida» ({ detail: { accion: "empezar" | "omitir" } })
// y main.js hace el resto (pedir el permiso de audio o entrar directo).
export const CLAVE = "onda_bienvenida_vista";
export const EVENTO = "onda:bienvenida";

/** ¿Ya la vio? También cuenta la marca de la animación antigua, para no enseñársela de nuevo a quien ya usa Onda. */
export function yaVista(almacen) {
  try { return !!(almacen.getItem(CLAVE) || almacen.getItem("onda-intro")); } catch (_) { return false; }
}
export function marcarVista(almacen) { try { almacen.setItem(CLAVE, "1"); } catch (_) { /* sin almacenamiento: saldrá otra vez */ } }

/**
 * Enlaza la pantalla. `el` = { raiz, diapos[], puntos[], boton, omitir, pistas }; `ventana` = window (o algo con dispatchEvent).
 * Devuelve { mostrar(n), reiniciar(), actual() }.
 */
export function montar(el, ventana, almacen) {
  let actual = 0;
  const ultima = () => el.diapos.length - 1;
  function mostrar(n) {
    n = Math.max(0, Math.min(ultima(), n));
    el.diapos.forEach((d, i) => { d.classList.toggle("activa", i === n); d.classList.toggle("salida", i < n); d.setAttribute("aria-hidden", i === n ? "false" : "true"); });
    el.puntos.forEach((p, i) => p.classList.toggle("activo", i === n));
    el.boton.textContent = n === ultima() ? "Empezar" : "Siguiente";
    el.omitir.hidden = n === ultima();
    actual = n;
  }
  function terminar(accion) {
    marcarVista(almacen);
    ventana.dispatchEvent(new CustomEvent(EVENTO, { detail: { accion } }));
  }
  el.boton.addEventListener("click", () => { if (actual < ultima()) mostrar(actual + 1); else terminar("empezar"); });
  el.omitir.addEventListener("click", () => terminar("omitir"));
  let x0 = null;
  el.pistas.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.pistas.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) mostrar(actual + (dx < 0 ? 1 : -1));
  });
  el.raiz.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") mostrar(actual + 1); if (e.key === "ArrowLeft") mostrar(actual - 1); });
  mostrar(0);
  return { mostrar, reiniciar: () => mostrar(0), actual: () => actual };
}
