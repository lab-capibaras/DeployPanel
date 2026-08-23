// DotCloud.jsx
import { useEffect, useRef } from 'react';

/* ─── Dot Cloud background ─── */
export default function DotCloud({ isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let t = 0;

    const setup = () => {
      const parent = canvas.parentElement;
      canvas.width  = parent ? parent.offsetWidth  : window.innerWidth;
      canvas.height = parent ? parent.offsetHeight : window.innerHeight;
    };
    setup();

    const onResize = () => { cancelAnimationFrame(raf); setup(); tick(); };
    window.addEventListener('resize', onResize, { passive: true });

    const DOT_R   = 1.4;   // radio de cada punto en px
    const SPACING = 14;    // separación entre puntos en px

    const tick = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      t += 0.0022;

      const cols = Math.ceil(W / SPACING) + 2;
      const rows = Math.ceil(H / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING;
          const y = r * SPACING;

          // Coordenadas normalizadas
          const nx = x / W;
          const ny = y / H;

          // Suma de ondas sinusoidales desplazadas en el tiempo → formas de nube orgánicas
          const w1 = Math.sin(nx * 5.2 + t)        * Math.sin(ny * 3.8 + t * 0.65);
          const w2 = Math.sin(nx * 2.4 - t * 0.55) * Math.cos(ny * 4.6 + t * 0.28);
          const w3 = Math.cos(nx * 7.1 + t * 0.9)  * Math.sin(ny * 2.1 - t * 0.42);
          const w4 = Math.sin((nx + ny) * 3.3 + t * 0.35);

          const combined = (w1 + w2 + w3 + w4) / 4;
          // Mapear [-1,1] a [0,1] y limitar
          const opacity = Math.max(0, Math.min(1, combined * 0.9 + 0.35));

          if (opacity < 0.04) continue; // saltar puntos invisibles (optimización)

          ctx.beginPath();
          ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(255,255,255,${(opacity * 0.28).toFixed(3)})`
            : `rgba(0,0,0,${(opacity * 0.18).toFixed(3)})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [isDark]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
