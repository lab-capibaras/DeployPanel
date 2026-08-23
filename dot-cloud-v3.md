# Fix: DotCloud — nubes separadas + interacción con cursor + más rápido

## Reemplazar `DotCloud` completo en `Home.jsx` y `Deploy.jsx`

```jsx
/* ─── Dot Cloud background ─── */
function DotCloud({ isDark }) {
  const ref    = useRef(null);
  const mouse  = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let t = 0;

    // Centros de nubes fijos — cada nube tiene una posición relativa y un "radio"
    const CLOUDS = [
      { nx: 0.18, ny: 0.22, rx: 0.22, ry: 0.18, seed: 0.0  },
      { nx: 0.72, ny: 0.15, rx: 0.20, ry: 0.16, seed: 1.3  },
      { nx: 0.50, ny: 0.55, rx: 0.26, ry: 0.20, seed: 2.6  },
      { nx: 0.85, ny: 0.65, rx: 0.18, ry: 0.22, seed: 3.9  },
      { nx: 0.12, ny: 0.72, rx: 0.20, ry: 0.18, seed: 5.2  },
      { nx: 0.62, ny: 0.85, rx: 0.22, ry: 0.16, seed: 6.5  },
    ];

    const DOT_R    = 1.1;
    const SPACING  = 7;
    const MOUSE_R  = 90;   // radio de influencia del cursor en px
    const MOUSE_STR = 0.6; // fuerza de repulsión (0–1)

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Seguimiento del cursor
    const onMouseMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };
    const onMouseLeave = () => {
      mouse.current.x = -9999;
      mouse.current.y = -9999;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave, { passive: true });

    // Función de nube: opacity basada en distancia al centro de la nube + ruido
    const cloudOpacity = (nx, ny, cloud, t) => {
      const dx = (nx - cloud.nx) / cloud.rx;
      const dy = (ny - cloud.ny) / cloud.ry;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 1.0) return 0; // fuera del elipse de la nube

      // Caída gaussiana desde el centro
      const gauss = Math.exp(-dist2 * 2.8);

      // Ruido animado para bordes orgánicos
      const angle = Math.atan2(dy, dx);
      const noise =
        Math.sin(angle * 3.0 + t * 1.2 + cloud.seed) * 0.18 +
        Math.sin(angle * 5.5 - t * 0.8 + cloud.seed) * 0.10 +
        Math.cos(angle * 2.0 + t * 0.5 + cloud.seed) * 0.12;

      return Math.max(0, Math.min(1, gauss + noise));
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      t += 0.012; // velocidad rápida

      const mx = mouse.current.x;
      const my = mouse.current.y;

      const cols = Math.ceil(W / SPACING) + 2;
      const rows = Math.ceil(H / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let x = c * SPACING;
          let y = r * SPACING;

          // ── Interacción con el cursor ──
          const mdx = x - mx;
          const mdy = y - my;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < MOUSE_R && mdist > 0) {
            const force = (1 - mdist / MOUSE_R) * MOUSE_STR * 18;
            x += (mdx / mdist) * force;
            y += (mdy / mdist) * force;
          }

          const nx = x / W;
          const ny = y / H;

          // ── Opacidad: máximo de todas las nubes en este punto ──
          let op = 0;
          for (let i = 0; i < CLOUDS.length; i++) {
            const v = cloudOpacity(nx, ny, CLOUDS[i], t);
            if (v > op) op = v;
          }

          if (op < 0.04) continue;

          // Boost leve cerca del cursor (los puntos que están dentro de MOUSE_R brillan más)
          if (mdist < MOUSE_R) {
            op = Math.min(1, op + (1 - mdist / MOUSE_R) * 0.4);
          }

          ctx.beginPath();
          ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(255,255,255,${(op * 0.6).toFixed(3)})`
            : `rgba(0,0,0,${(op * 0.38).toFixed(3)})`;
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
```

---

## Cómo funciona

**Nubes separadas:** se definen 6 elipses (`CLOUDS`) en posiciones relativas de la pantalla. Cada punto solo es visible si cae dentro de alguna elipse — fuera de ellas la opacidad es 0. Los bordes de cada nube se distorsionan con ruido sinusoidal animado para que parezcan orgánicos y en movimiento.

**Interacción con cursor:** dentro de un radio de 90px, los puntos se desplazan hacia afuera del cursor (repulsión). Los puntos dentro de ese radio también aumentan ligeramente su brillo.

**Velocidad:** `t += 0.012` — 3x más rápido que la versión anterior.

---

## Parámetros ajustables

| Parámetro | Valor actual | Efecto |
|---|---|---|
| `SPACING` | 7 | Separación entre puntos — bajar = más denso |
| `MOUSE_R` | 90 | Radio de influencia del cursor en px |
| `MOUSE_STR` | 0.6 | Fuerza de repulsión — 0 = nada, 1 = máxima |
| `t += 0.012` | 0.012 | Velocidad de animación |
| `CLOUDS` | 6 nubes | Agregar o quitar objetos para más/menos nubes |
| `gauss * 2.8` | 2.8 | Qué tan concentrada es cada nube — más alto = núcleo más pequeño |

## Archivos a modificar

Reemplazar la función `DotCloud` completa en:
- `deploy_panel/apps/web/src/pages/Home.jsx`
- `deploy_panel/apps/web/src/pages/Deploy.jsx`

No se requiere ningún otro cambio.
