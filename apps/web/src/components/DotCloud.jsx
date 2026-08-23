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

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const DOT_R   = 1.0;  // radio del punto en px
    const SPACING = 7;    // separación entre puntos (más juntos)

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      t += 0.004;

      const cols = Math.ceil(W / SPACING) + 2;
      const rows = Math.ceil(H / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING;
          const y = r * SPACING;
          const nx = x / W;
          const ny = y / H;

          const w1 = Math.sin(nx * 6.0 + t)         * Math.sin(ny * 4.2 + t * 0.7);
          const w2 = Math.sin(nx * 2.8 - t * 0.6)   * Math.cos(ny * 5.1 + t * 0.3);
          const w3 = Math.cos(nx * 8.0 + t * 1.1)   * Math.sin(ny * 2.5 - t * 0.5);
          const w4 = Math.sin((nx + ny) * 3.5 + t * 0.4);

          const v = (w1 + w2 + w3 + w4) / 4;
          const opacity = Math.max(0, Math.min(1, v * 1.1 + 0.3));

          if (opacity < 0.05) continue;

          ctx.beginPath();
          ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(255,255,255,${(opacity * 0.55).toFixed(3)})`
            : `rgba(0,0,0,${(opacity * 0.35).toFixed(3)})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [isDark]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
