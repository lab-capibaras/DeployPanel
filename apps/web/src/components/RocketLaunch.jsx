// RocketLaunch.jsx — animación de despegue al terminar un deploy con éxito (~3.2 s).
// Se monta en <body> vía portal: dentro de .page-transition (z-index:1) el navbar
// (z-50) quedaría por encima del overlay.
import { createPortal } from 'react-dom';
import { CheckCircleIcon } from './Icons';

// Posiciones fijas (no aleatorias) para que el render sea puro
const SPEED_LINES = [
  { x: 8, d: 0.9, h: 90 }, { x: 17, d: 1.25, h: 60 }, { x: 26, d: 1.0, h: 120 },
  { x: 35, d: 1.45, h: 70 }, { x: 64, d: 1.1, h: 100 }, { x: 72, d: 0.95, h: 65 },
  { x: 81, d: 1.35, h: 110 }, { x: 90, d: 1.05, h: 80 }, { x: 44, d: 1.6, h: 55 },
  { x: 56, d: 1.5, h: 75 },
];
const SMOKE = [
  { x: -46, s: 1.0, d: 0.25 }, { x: 46, s: 1.0, d: 0.3 }, { x: -24, s: 1.3, d: 0.35 },
  { x: 24, s: 1.3, d: 0.4 }, { x: 0, s: 1.6, d: 0.45 }, { x: -70, s: 0.8, d: 0.5 }, { x: 70, s: 0.8, d: 0.55 },
];

function Rocket() {
  return (
    <svg width="72" height="132" viewBox="0 0 72 132" fill="none" aria-hidden>
      {/* Aletas */}
      <path d="M22 78 L8 100 L8 108 L24 98 Z" fill="var(--px-accent)" />
      <path d="M50 78 L64 100 L64 108 L48 98 Z" fill="var(--px-accent)" />
      {/* Cuerpo */}
      <path d="M36 4 C52 18 54 46 52 96 L20 96 C18 46 20 18 36 4 Z" fill="var(--px-white)" />
      <path d="M36 4 C44 11 48 22 50 34 L22 34 C24 22 28 11 36 4 Z" fill="var(--px-accent)" />
      {/* Ventana */}
      <circle cx="36" cy="54" r="8" fill="var(--px-bg)" stroke="var(--px-accent)" strokeWidth="3" />
      {/* Tobera */}
      <path d="M26 96 L46 96 L42 104 L30 104 Z" fill="var(--px-border-glow)" />
    </svg>
  );
}

export default function RocketLaunch({ title }) {
  return createPortal(
    <div className="rl-overlay" role="status" aria-live="polite">
      {SPEED_LINES.map((l, i) => (
        <span key={i} className="rl-speedline" style={{ left: `${l.x}%`, height: l.h, animationDelay: `${l.d}s` }} />
      ))}

      <div className="rl-stage">
        {SMOKE.map((p, i) => (
          <span key={i} className="rl-smoke" style={{ '--x': `${p.x}px`, '--s': p.s, animationDelay: `${p.d}s` }} />
        ))}
        {/* Exterior: despegue · interior: temblor previo (ambos usan transform) */}
        <div className="rl-rocket">
          <div className="rl-trail" />
          <div className="rl-body">
            <div className="rl-flame" />
            <Rocket />
          </div>
        </div>
      </div>

      <div className="rl-done">
        <span style={{ color: 'var(--px-green)' }}><CheckCircleIcon size={64} /></span>
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--px-white)', marginTop: 16 }}>{title}</div>
      </div>
    </div>,
    document.body
  );
}
