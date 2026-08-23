// DotCloud.jsx
import { useEffect, useRef } from 'react';

/* ─── Dot Cloud background ─── */
export default function DotCloud({ isDark }) {
  const ref   = useRef(null);
  const mouse = useRef({ x: -9999, y: -9999 });

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
      { nx: 0.18, ny: 0.22, rx: 0.22, ry: 0.18, vx: 0.12,  vy: 0.075, seed: 0.0 },
      { nx: 0.72, ny: 0.15, rx: 0.20, ry: 0.16, vx: -0.09, vy: 0.105, seed: 1.3 },
      { nx: 0.50, ny: 0.55, rx: 0.26, ry: 0.20, vx: 0.15,  vy: -0.06, seed: 2.6 },
      { nx: 0.85, ny: 0.65, rx: 0.18, ry: 0.22, vx: -0.12, vy: -0.09, seed: 3.9 },
      { nx: 0.12, ny: 0.72, rx: 0.20, ry: 0.18, vx: 0.105, vy: 0.12,  seed: 5.2 },
      { nx: 0.62, ny: 0.85, rx: 0.22, ry: 0.16, vx: -0.075,vy: -0.105,seed: 6.5 },
    ];

    const DOT_R    = 1.1;
    const SPACING  = 7;
    const MOUSE_R  = 80;    // radio de influencia en px
    const MOUSE_F  = 22;    // fuerza de empuje en px

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const onMouseMove = (e) => {
      // clientX/Y ya son coordenadas de viewport — coinciden exactamente con fixed canvas
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };
    const onMouseLeave = () => {
      mouse.current.x = -9999;
      mouse.current.y = -9999;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave);

    // Opacidad de un punto (x,y en pixels) respecto a una nube en movimiento
    const cloudOp = (px, py, cloud, W, H, t) => {
      // Posición actual de la nube: oscila con sin/cos alrededor de su centro
      const cnx = cloud.nx + Math.sin(t * cloud.vx + cloud.seed)       * 0.18;
      const cny = cloud.ny + Math.cos(t * cloud.vy + cloud.seed * 0.7) * 0.14;

      const cx = cnx * W;
      const cy = cny * H;
      const rx = cloud.rx * W;
      const ry = cloud.ry * H;

      const dx = (px - cx) / rx;
      const dy = (py - cy) / ry;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 1.0) return 0;

      const gauss = Math.exp(-dist2 * 2.6);
      const angle = Math.atan2(dy, dx);
      const noise =
        Math.sin(angle * 3.0 + t * 1.4 + cloud.seed) * 0.18 +
        Math.sin(angle * 5.5 - t * 0.9 + cloud.seed) * 0.10 +
        Math.cos(angle * 2.0 + t * 0.6 + cloud.seed) * 0.12;

      return Math.max(0, Math.min(1, gauss + noise));
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      t += 0.014;

      const mx = mouse.current.x;
      const my = mouse.current.y;

      const cols = Math.ceil(W / SPACING) + 2;
      const rows = Math.ceil(H / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const baseX = c * SPACING;
          const baseY = r * SPACING;

          // ── 1. Calcular opacidad en posición original ──
          let op = 0;
          for (let i = 0; i < CLOUDS.length; i++) {
            const v = cloudOp(baseX, baseY, CLOUDS[i], W, H, t);
            if (v > op) op = v;
          }
          if (op < 0.04) continue;

          // ── 2. Calcular desplazamiento del cursor ──
          const mdx = baseX - mx;
          const mdy = baseY - my;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          let drawX = baseX;
          let drawY = baseY;
          let opBoost = 0;

          if (mdist < MOUSE_R && mdist > 0.5) {
            const force = (1 - mdist / MOUSE_R) * MOUSE_F;
            drawX = baseX + (mdx / mdist) * force;
            drawY = baseY + (mdy / mdist) * force;
            opBoost = (1 - mdist / MOUSE_R) * 0.45;
          }

          // ── 3. Dibujar en posición desplazada ──
          ctx.beginPath();
          ctx.arc(drawX, drawY, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(255,255,255,${Math.min(1, (op + opBoost) * 0.62).toFixed(3)})`
            : `rgba(0,0,0,${Math.min(1, (op + opBoost) * 0.40).toFixed(3)})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [isDark]);

  return (
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
    />
  );
}
