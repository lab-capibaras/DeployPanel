/**
 * Smooth scroll con inercia tipo móvil para desktop.
 * - Velocidad moderada y natural
 * - Compatible con la scrollbar nativa (detecta arrastre y cede el control)
 */
export function initSmoothScroll() {
  let targetY   = window.scrollY;
  let rafId     = null;
  // Última posición que NOSOTROS pusimos vía scrollTo (para detectar arrastre de scrollbar)
  let lastSetY  = window.scrollY;

  // ── Ajusta estos valores para cambiar la sensación ──────────────────────────
  const EASE             = 0.07;   // suavizado por frame  (0.06 muy suave, 0.12 rápido)
  const FRICTION         = 0.85;   // inercia del wheel    (0.90 mucha, 0.75 poca)
  const WHEEL_MULTIPLIER = 0.6;    // sensibilidad rueda   (menos = más lento)
  // ────────────────────────────────────────────────────────────────────────────

  let velocity = 0;

  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function animate() {
    const currentY = window.scrollY;

    // ── Detectar arrastre de scrollbar nativa ──
    // Si el scroll cambió más de 4px respecto a lo que pusimos nosotros
    // significa que el usuario movió la scrollbar → cedemos control.
    if (Math.abs(currentY - lastSetY) > 4) {
      targetY  = currentY;
      lastSetY = currentY;
      velocity = 0;
      rafId    = null;
      return;
    }

    // Aplicar fricción a la inercia
    velocity *= FRICTION;

    // Actualizar destino con la velocidad residual
    targetY = clamp(targetY + velocity, 0, maxScroll());

    // Interpolar hacia el destino (easing exponencial)
    const diff  = targetY - currentY;
    const newY  = currentY + diff * EASE;

    // Parar cuando ya estamos suficientemente cerca
    if (Math.abs(diff) < 0.5 && Math.abs(velocity) < 0.5) {
      window.scrollTo(0, Math.round(targetY));
      lastSetY = Math.round(targetY);
      rafId    = null;
      return;
    }

    window.scrollTo(0, newY);
    lastSetY = newY;
    rafId = requestAnimationFrame(animate);
  }

  function onWheel(e) {
    // Dejar pasar trackpad con momentum nativo (deltaY muy pequeño y deltaMode 0)
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 2) return;

    e.preventDefault();

    // Normalizar delta según modo
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 32;                  // LINE → px
    if (e.deltaMode === 2) delta *= window.innerHeight;  // PAGE → px

    // Limitar la velocidad máxima acumulada para evitar saltos bruscos
    const MAX_VELOCITY = window.innerHeight * 0.8;
    velocity = clamp(velocity + delta * WHEEL_MULTIPLIER, -MAX_VELOCITY, MAX_VELOCITY);

    // Proyectar destino basado en velocidad actual
    targetY = clamp(window.scrollY + velocity, 0, maxScroll());

    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    window.removeEventListener('wheel', onWheel);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
