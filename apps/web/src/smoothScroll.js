/**
 * Smooth scroll con inercia tipo móvil para desktop.
 * Intercepta la rueda del mouse y anima el scroll con decaimiento exponencial.
 */
export function initSmoothScroll() {
  // Objetivo de scroll actual
  let targetY = window.scrollY;
  // Velocidad acumulada del wheel
  let velocity = 0;
  // Frame de animación activo
  let rafId = null;

  // Factor de suavizado: cuánto del delta llega per frame (0.06 = muy suave, 0.12 = normal)
  const EASE = 0.085;
  // Factor de fricción / decaimiento de la inercia
  const FRICTION = 0.88;
  // Amplificación del delta de la rueda
  const WHEEL_MULTIPLIER = 1.1;

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  function animate() {
    // Aplicar fricción a la velocidad
    velocity *= FRICTION;

    // Mover el target hacia donde apunta la velocidad
    targetY = clamp(targetY + velocity, 0, maxScroll());

    // Interpolar posición actual hacia el target (easing exponencial)
    const currentY = window.scrollY;
    const diff = targetY - currentY;

    if (Math.abs(diff) < 0.5 && Math.abs(velocity) < 0.5) {
      // Ya llegamos, saltar al destino exacto y parar
      window.scrollTo(0, targetY);
      rafId = null;
      return;
    }

    window.scrollTo(0, currentY + diff * EASE);
    rafId = requestAnimationFrame(animate);
  }

  function onWheel(e) {
    // Dejar pasar eventos touch (trackpad con momentum nativo en Mac/Chrome)
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 1.5) return;

    e.preventDefault();

    // Normalizar delta según modo (PIXEL vs LINE vs PAGE)
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 32;       // LINE mode → px
    if (e.deltaMode === 2) delta *= window.innerHeight; // PAGE mode → px

    velocity += delta * WHEEL_MULTIPLIER;
    targetY = clamp(window.scrollY + velocity, 0, maxScroll());

    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('wheel', onWheel, { passive: false });

  // Sincronizar targetY cuando el usuario arrastra la scrollbar nativa
  window.addEventListener('scroll', () => {
    if (!rafId) {
      targetY = window.scrollY;
    }
  }, { passive: true });

  // Cleanup (útil si en el futuro se desmonta)
  return () => {
    window.removeEventListener('wheel', onWheel);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
