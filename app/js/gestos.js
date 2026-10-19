// Gestos táctiles sin librerías: arrastrar y soltar con resorte, usando eventos de puntero (sirven con dedo y con ratón).

export const vibra = (ms = 12) => { try { navigator.vibrate?.(ms); } catch (_) { /* sin vibración */ } };

/**
 * deslizar(el, opciones)
 *  puede(e)           → algo "verdadero" si el gesto puede empezar ahí (ese valor llega como `ctx`)
 *  acepta(eje,dx,dy)  → falso para ceder el gesto (por ejemplo a otro elemento o al desplazamiento normal)
 *  empezar(eje,ctx), mover(dx,dy,eje,ctx), soltar(dx,dy,vx,vy,eje,ctx), cancelar(ctx)
 */
export function deslizar(el, o) {
  let p = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ctx = o.puede ? o.puede(e) : true; if (!ctx) return;
    p = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0, dx: 0, dy: 0, eje: null, ctx };
  });
  el.addEventListener("pointermove", (e) => {
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.eje) {
      if (Math.hypot(dx, dy) < 10) return;
      const eje = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (o.acepta && !o.acepta(eje, dx, dy, p.ctx)) { p = null; return; }
      p.eje = eje; try { el.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ } o.empezar?.(eje, p.ctx);
    }
    const dt = e.timeStamp - p.lt; if (dt > 0) { p.vx = (e.clientX - p.lx) / dt; p.vy = (e.clientY - p.ly) / dt; }
    p.lx = e.clientX; p.ly = e.clientY; p.lt = e.timeStamp; p.dx = dx; p.dy = dy;
    o.mover?.(dx, dy, p.eje, p.ctx);
  });
  const fin = (e, cancelado) => {
    if (!p || e.pointerId !== p.id) return; const q = p; p = null; if (!q.eje) return;
    const parar = (ev) => { ev.stopPropagation(); ev.preventDefault(); };                  // el soltar no cuenta como toque
    window.addEventListener("click", parar, true); setTimeout(() => window.removeEventListener("click", parar, true), 80);
    if (cancelado) o.cancelar?.(q.ctx); else o.soltar?.(q.dx, q.dy, q.vx, q.vy, q.eje, q.ctx);
  };
  el.addEventListener("pointerup", (e) => fin(e, false));
  el.addEventListener("pointercancel", (e) => fin(e, true));
}

/** Arrastrar hacia abajo desde las zonas indicadas para cerrar una hoja (como en iOS); si no alcanza, vuelve con resorte. */
export function arrastrarHoja(hoja, zonas, cerrar) {
  deslizar(hoja, {
    puede: (e) => zonas.some((z) => e.target.closest(z)) && !e.target.closest("input[type=range]") && hoja.scrollTop <= 0,
    acepta: (eje, dx, dy) => eje === "y" && dy > 0,
    empezar: () => { hoja.style.transition = "none"; },
    mover: (dx, dy) => { hoja.style.transform = `translateY(${Math.max(0, dy)}px)`; },
    soltar: (dx, dy, vx, vy) => {
      const cierra = dy > 130 || vy > 0.7; hoja.style.transition = "";
      requestAnimationFrame(() => { hoja.style.transform = ""; if (cierra) { vibra(8); cerrar(hoja.id); } });
    },
    cancelar: () => { hoja.style.transition = ""; hoja.style.transform = ""; },
  });
}
