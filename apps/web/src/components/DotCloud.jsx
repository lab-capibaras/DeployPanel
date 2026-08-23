// DotCloud.jsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ─── Dot Cloud background ─── */
export default function DotCloud({ isDark }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let t = 0;

    // Cada nube tiene posición que se mueve con el tiempo
    // nx/ny = posición inicial relativa (0–1)
    // vx/vy = velocidad de drift
    // rx/ry = radio de la elipse relativo al tamaño de pantalla
    const CLOUDS = [
      { nx: 0.18, ny: 0.22, rx: 0.22, ry: 0.18, vx: 0.24,  vy: 0.15,  seed: 0.0 },
      { nx: 0.72, ny: 0.15, rx: 0.20, ry: 0.16, vx: -0.18, vy: 0.21,  seed: 1.3 },
      { nx: 0.50, ny: 0.55, rx: 0.26, ry: 0.20, vx: 0.30,  vy: -0.12, seed: 2.6 },
      { nx: 0.85, ny: 0.65, rx: 0.18, ry: 0.22, vx: -0.24, vy: -0.18, seed: 3.9 },
      { nx: 0.12, ny: 0.72, rx: 0.20, ry: 0.18, vx: 0.21,  vy: 0.24,  seed: 5.2 },
      { nx: 0.62, ny: 0.85, rx: 0.22, ry: 0.16, vx: -0.15, vy: -0.21, seed: 6.5 },
    ];

    const DOT_R   = 1.1;
    const SPACING = 7;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Ruido 2D barato (suma de senos cruzados en varias frecuencias/direcciones)
    // usado para deformar el espacio antes de medir distancia — así el contorno
    // de la nube deja de ser un círculo/elipse "tembloroso" y pasa a ser una
    // silueta irregular, tipo humo.
    const noise2D = (x, y, t, seed) => (
      Math.sin(x * 2.1 + y * 1.6 + t * 0.6 + seed) +
      Math.sin(x * 4.4 - y * 3.2 + t * 0.9 + seed * 1.7) * 0.5 +
      Math.sin(x * 8.3 + y * 6.5 - t * 0.5 + seed * 2.9) * 0.25
    ) / 1.75;

    // Opacidad de un punto (x,y en pixels) respecto a una nube en movimiento
    const cloudOp = (px, py, cloud, W, H, t) => {
      // Posición actual de la nube: oscila con sin/cos alrededor de su centro
      const cnx = cloud.nx + Math.sin(t * cloud.vx + cloud.seed)       * 0.18;
      const cny = cloud.ny + Math.cos(t * cloud.vy + cloud.seed * 0.7) * 0.14;

      const cx = cnx * W;
      const cy = cny * H;
      const rx = cloud.rx * W;
      const ry = cloud.ry * H;

      let dx = (px - cx) / rx;
      let dy = (py - cy) / ry;

      // Descarte rápido antes del cálculo de ruido (más caro), dejando margen
      // suficiente para el desplazamiento máximo que puede introducir el warp
      if (dx * dx + dy * dy > 2.25) return 0;

      // Domain warping: dos octavas de ruido a distinta escala/velocidad
      dx += noise2D(dx * 1.3, dy * 1.3, t, cloud.seed) * 0.65
          + noise2D(dx * 3.1 + 9.1, dy * 3.1 + 9.1, t * 1.4, cloud.seed) * 0.22;
      dy += noise2D(dx * 1.3 + 3.7, dy * 1.3 + 3.7, t, cloud.seed) * 0.65
          + noise2D(dx * 3.1 - 5.4, dy * 3.1 - 5.4, t * 1.4, cloud.seed) * 0.22;

      const dist2 = dx * dx + dy * dy;
      if (dist2 > 1.0) return 0;

      return Math.max(0, Math.min(1, Math.exp(-dist2 * 2.4)));
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      t += 0.026;

      const cols = Math.ceil(W / SPACING) + 2;
      const rows = Math.ceil(H / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING;
          const y = r * SPACING;

          let op = 0;
          for (let i = 0; i < CLOUDS.length; i++) {
            const v = cloudOp(x, y, CLOUDS[i], W, H, t);
            if (v > op) op = v;
          }
          if (op < 0.04) continue;

          ctx.beginPath();
          ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(255,255,255,${(op * 0.62).toFixed(3)})`
            : `rgba(0,0,0,${(op * 0.40).toFixed(3)})`;
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

  // Se monta vía portal directo en <body>, fuera del árbol de la página:
  // así ningún ancestro (transform / filter / backdrop-filter de alguna card,
  // animación de entrada, etc.) puede "atrapar" el position:fixed y cortar
  // el fondo a mitad de página.
  return createPortal(
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />,
    document.body
  );
}
