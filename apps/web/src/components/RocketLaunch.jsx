// RocketLaunch.jsx — despegue en ASCII art al terminar un deploy con éxito (~3.2 s).
// Escena procedural dibujada en un <canvas> sobre una grilla de caracteres
// monoespaciados (mismo estilo que el video de planetas): cohete sombreado,
// llama y humo como partículas, plataforma con torre y estrellas que se
// estiran en líneas de velocidad. Se monta en <body> vía portal para quedar
// por encima del navbar.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon } from './Icons';

const CW = 6;    // ancho de celda (px CSS)
const CH = 11;   // alto de celda
const S = 1.25;  // escala del cohete
const RAMP = ' .:-=+*#%@';
const LIFT_AT = 0.7;      // segundos en la plataforma antes de despegar
const LIFT_DUR = 1.85;    // segundos hasta salir por arriba

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const levels = (a, b) => Array.from({ length: 10 }, (_, i) => `rgb(${lerp(a, b, i / 9).join(',')})`);

// Paletas: índice 0..9 = más claro→más intenso en oscuro; en claro es "tinta" sobre blanco
const PALETTES = {
  dark: {
    body: levels([60, 66, 82], [248, 250, 255]),
    blue: levels([25, 45, 150], [150, 182, 255]),
    glass: levels([10, 15, 40], [120, 160, 255]),
    flame: levels([41, 98, 255], [255, 255, 255]),
    smoke: levels([50, 52, 60], [175, 179, 190]),
    star: 'rgb(150,160,200)',
    ground: 'rgb(95,100,118)',
  },
  light: {
    body: levels([175, 180, 195], [20, 24, 38]),
    blue: levels([150, 172, 240], [15, 45, 190]),
    glass: levels([200, 210, 240], [10, 30, 120]),
    flame: levels([150, 180, 255], [10, 40, 170]),
    smoke: levels([222, 224, 230], [125, 129, 141]),
    star: 'rgb(140,150,190)',
    ground: 'rgb(150,156,172)',
  },
};

export default function RocketLaunch({ title }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pal = PALETTES[document.documentElement.classList.contains('light-mode') ? 'light' : 'dark'];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0, cols = 0, rows = 0;
    let heat, smoke, layer, level, edgeChar;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CW); rows = Math.ceil(H / CH);
      heat = new Float32Array(cols * rows);
      smoke = new Float32Array(cols * rows);
      layer = new Uint8Array(cols * rows);   // 0 nada · 1 estrella · 2 suelo · 3 humo · 4 llama · 5 cuerpo · 6 azul · 7 vidrio · 8 contorno
      level = new Uint8Array(cols * rows);
      edgeChar = new Array(cols * rows);
    };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), tw: Math.random() * 6.28 }));
    const flames = [];
    const puffs = [];
    let scroll = 0;
    let last = performance.now();
    const start = last;
    let raf;

    const put = (c, r, lay, lv) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      if (lay >= layer[i]) { layer[i] = lay; level[i] = lv; }
    };

    const frame = (now) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const baseY = H * 0.62;
      const lift = t > LIFT_AT ? ((t - LIFT_AT) / LIFT_DUR) ** 2 : 0;
      const rocketY = baseY - lift * (baseY + 420);
      const shake = t < LIFT_AT + 0.05 ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 1.2 * Math.max(0, 1 - (t - LIFT_AT));
      const cx = W / 2 + shake;
      const speed = t > LIFT_AT ? Math.min(1, (t - LIFT_AT) / 1.2) : 0;   // sensación de velocidad
      scroll += speed * H * 1.1 * dt;
      const groundY = baseY + 114 * S + 8 + scroll;

      heat.fill(0); smoke.fill(0); layer.fill(0);

      // ── Estrellas (titilan; con velocidad se estiran hacia abajo)
      for (const s of stars) {
        s.y += speed * 1.5 * dt;
        if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
        const c = Math.floor(s.x * cols), r = Math.floor(s.y * rows);
        // Solo la mitad de las estrellas se estira, y poco: si no parece lluvia
        const len = s.tw > 3.14 ? Math.round(speed * 3) : 0;
        if (len === 0) put(c, r, 1, Math.sin(t * 4 + s.tw) > 0.3 ? 2 : 1);
        for (let k = 0; k < len; k++) put(c, r - k, 1, k === 0 ? 3 : 2);
      }

      // ── Plataforma: suelo + torre con brazo que se retrae
      if (groundY < H + CH) {
        const gr = Math.floor(groundY / CH);
        const half = Math.floor(cols * 0.32);
        for (let c = Math.floor(cx / CW) - half; c <= Math.floor(cx / CW) + half; c++) put(c, gr, 2, 0);
        const tc = Math.floor((cx - 110) / CW);
        const top = Math.floor((groundY - 330) / CH);
        for (let r = top; r < gr; r++) { put(tc, r, 2, 1); put(tc + 2, r, 2, 1); if ((r - top) % 3 === 0) put(tc + 1, r, 2, 2); }
        const armLen = Math.max(0, 6 - Math.floor(t * 10));
        const ar = Math.floor((baseY - 60 + scroll) / CH);
        for (let k = 0; k < armLen * 2; k++) put(tc + 3 + k, ar, 2, 3);
      }

      // ── Emisión de llama desde la tobera
      const nozzleY = rocketY + 114 * S;
      if (t > 0.12 && t < 2.9) {
        const n = t < LIFT_AT ? 4 + Math.floor(40 * (t - 0.12)) : 34;
        for (let k = 0; k < n && flames.length < 1600; k++) {
          flames.push({
            x: cx + (Math.random() - 0.5) * 22, y: nozzleY + Math.random() * 6,
            vx: (Math.random() - 0.5) * 70, vy: 240 + Math.random() * 260,
            life: 0.3 + Math.random() * 0.45, age: 0,
          });
        }
      }
      for (let i = flames.length - 1; i >= 0; i--) {
        const p = flames[i];
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt + speed * H * 1.1 * dt;
        // Al tocar el suelo se abre hacia los costados y se vuelve humo
        if (p.y > groundY - 4 && groundY < H + CH) {
          if (puffs.length < 520 && Math.random() < 0.5) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            puffs.push({ x: p.x, y: groundY - 10, vx: dir * (60 + Math.random() * 200), vy: -(8 + Math.random() * 40), r: 5, life: 1.1 + Math.random() * 1.1, age: 0 });
          }
          flames.splice(i, 1); continue;
        }
        if (p.age >= p.life) {
          if (t > LIFT_AT && puffs.length < 520 && Math.random() < 0.12) {
            puffs.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 30, vy: 10, r: 4, life: 0.9 + Math.random() * 0.8, age: 0 });
          }
          flames.splice(i, 1); continue;
        }
        const h = 1 - p.age / p.life;
        const c = Math.floor(p.x / CW), r = Math.floor(p.y / CH);
        if (c >= 0 && r >= 0 && c < cols && r < rows) {
          heat[r * cols + c] += h;
          if (c > 0) heat[r * cols + c - 1] += h * 0.35;
          if (c < cols - 1) heat[r * cols + c + 1] += h * 0.35;
        }
      }

      // ── Humo (densidad acumulada por discos que crecen)
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) { puffs.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt + speed * H * 1.1 * dt;
        p.vx *= 0.985; p.r += 26 * dt;
        const d = (1 - p.age / p.life) * 0.55;
        const c0 = Math.floor((p.x - p.r) / CW), c1 = Math.ceil((p.x + p.r) / CW);
        const r0 = Math.floor((p.y - p.r) / CH), r1 = Math.ceil((p.y + p.r) / CH);
        for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
          for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
            const dx = (c + 0.5) * CW - p.x, dy = (r + 0.5) * CH - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < p.r) smoke[r * cols + c] += d * (1 - dist / p.r);
          }
        }
      }
      for (let i = 0; i < cols * rows; i++) {
        if (smoke[i] > 0.06) { if (layer[i] < 3) { layer[i] = 3; level[i] = Math.min(8, Math.floor(smoke[i] * 9)); } }
        // Escala logarítmica: muchas partículas en la misma celda no saturan a blanco
        if (heat[i] > 0.08) { layer[i] = 4; level[i] = 1 + Math.floor(8 * (1 - Math.exp(-heat[i] * 0.3))); }
      }

      // ── Cohete: máscara por partes, contorno de líneas y sombreado de cilindro
      const bw = 30;
      const c0 = Math.floor((cx - 80 * S) / CW), c1 = Math.ceil((cx + 80 * S) / CW);
      const r0 = Math.floor((rocketY - 196 * S) / CH), r1 = Math.ceil((rocketY + 118 * S) / CH);
      const bwC = c1 - c0 + 1;
      const partAt = (c, r) => {
        const lx = ((c + 0.5) * CW - cx) / S, ly = ((r + 0.5) * CH - rocketY) / S;
        if (ly >= -192 && ly < -110) {                                   // punta ojival
          const sN = (-110 - ly) / 82;
          const hw = bw * Math.sqrt(Math.max(0, 1 - sN * sN));
          return Math.abs(lx) < hw ? [6, lx / hw, 'nose'] : null;
        }
        if (ly >= -110 && ly < 92 && Math.abs(lx) < bw) {                // cuerpo
          const wd = Math.hypot(lx, ly + 44);                            // ventana
          if (wd < 14) return [wd > 9 ? 6 : 7, (lx + 4) / 10, 'win'];
          return [(ly > 48 && ly < 62) ? 6 : 5, lx / bw, 'body'];
        }
        if (ly >= 92 && ly < 114 && Math.abs(lx) < 15 + (ly - 92) * 0.4) return [5, 0.85, 'nozzle'];
        if (ly >= 28 && ly < 114) {                                      // aletas
          const fw = 36 * (ly - 28) / 86;
          if (Math.abs(lx) >= bw && Math.abs(lx) < bw + fw) return [6, Math.sign(lx) * 0.7, 'fin'];
        }
        return null;
      };
      const mask = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) mask.push(partAt(c, r));
      const at = (c, r) => (c < c0 || c > c1 || r < r0 || r > r1) ? null : mask[(r - r0) * bwC + (c - c0)];
      for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
          const m = at(c, r);
          if (!m) continue;
          const [part, nx, zone] = m;
          const i = r * cols + c;
          const leftOut = !at(c - 1, r), rightOut = !at(c + 1, r), downOut = !at(c, r + 1);
          // Contorno: líneas según la zona (punta/aletas en diagonal, cuerpo vertical)
          if (leftOut || rightOut || (downOut && zone !== 'nozzle')) {
            let ch = '|';
            if (zone === 'nose') ch = leftOut ? '/' : '\\';
            else if (zone === 'fin') ch = downOut ? '_' : (leftOut ? '/' : '\\');
            else if (downOut) ch = '_';
            layer[i] = 8; level[i] = part === 5 ? 9 : 8;
            edgeChar[i] = ch;
            continue;
          }
          const lam = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.8 - nx * 0.45 + 0.2));
          layer[i] = part;
          level[i] = part === 7 ? Math.round(2 + lam * 7) : Math.max(2, Math.round(1 + lam * 8));
        }
      }

      // ── Dibujo agrupado por color (menos cambios de fillStyle)
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${CH - 1}px Menlo, Monaco, 'JetBrains Mono', monospace`;
      ctx.textBaseline = 'top';
      const groups = new Map();
      for (let i = 0; i < cols * rows; i++) {
        const lay = layer[i];
        if (!lay) continue;
        const lv = level[i];
        let color, ch;
        switch (lay) {
          case 1: color = pal.star; ch = lv >= 3 ? '|' : (lv === 2 ? '·' : '.'); break;
          case 2: color = pal.ground; ch = ['=', '|', '+', '-'][lv]; break;
          case 3: color = pal.smoke[lv]; ch = RAMP[Math.max(1, lv)]; break;
          case 4: color = pal.flame[lv]; ch = RAMP[Math.max(1, lv)]; break;
          case 5: color = pal.body[lv]; ch = RAMP[lv]; break;
          case 6: color = pal.blue[lv]; ch = RAMP[lv]; break;
          case 7: color = pal.glass[lv]; ch = RAMP[lv]; break;
          default: color = lv === 9 ? pal.body[9] : pal.blue[9]; ch = edgeChar[i]; // contorno: blanco en el cuerpo, azul en punta/aletas
        }
        let g = groups.get(color);
        if (!g) { g = []; groups.set(color, g); }
        g.push(i, ch);
      }
      for (const [color, g] of groups) {
        ctx.fillStyle = color;
        for (let k = 0; k < g.length; k += 2) {
          const i = g[k];
          ctx.fillText(g[k + 1], (i % cols) * CW, Math.floor(i / cols) * CH);
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return createPortal(
    <div className="rl-overlay" role="status" aria-live="polite">
      <canvas ref={canvasRef} className="rl-canvas" aria-hidden />
      <div className="rl-done">
        <span style={{ color: 'var(--px-green)' }}><CheckCircleIcon size={64} /></span>
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--px-white)', marginTop: 16 }}>{title}</div>
      </div>
    </div>,
    document.body
  );
}
