import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';
import BrandMark from '../components/BrandMark';

/* ─── Scroll-reveal ─── */
function Reveal({ children, delay = 0, style = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal" style={{ '--reveal-delay': `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/* ─── Terminal simulado (dentro de la tarjeta del hero) ─── */
const TERMINAL_DELAYS = [0, 800, 1600, 2400, 3400, 4200, 5000, 5800];

function LiveTerminal() {
  const lines = useTranslation().home.terminal_lines;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let timers = [];
    const run = () => {
      timers.forEach(clearTimeout);
      timers = TERMINAL_DELAYS.map((d, i) => setTimeout(() => setShown(i + 1), d));
    };
    run();
    const loop = setInterval(() => { setShown(0); run(); }, 9000);
    return () => { clearInterval(loop); timers.forEach(clearTimeout); };
  }, []);

  return (
    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13.5, lineHeight: 2.05 }}>
      {lines.map((txt, i) => (
        <div key={i} style={{
          color: txt.startsWith('  ✓') ? 'var(--px-green)' : txt.startsWith('  >>') ? 'var(--px-accent)' : 'var(--px-muted)',
          fontWeight: txt.startsWith('  >>') ? 600 : 400,
          opacity: i < shown ? 1 : 0,
          transform: i < shown ? 'none' : 'translateX(-8px)',
          transition: 'opacity 0.3s, transform 0.3s',
          whiteSpace: 'pre',
        }}>{txt}</div>
      ))}
    </div>
  );
}

/* ─── Gráfico decorativo (línea + área, estilo TradingView) ─── */
const CHART_POINTS = [62, 58, 64, 55, 60, 52, 57, 49, 54, 44, 50, 41, 46, 36, 42, 33, 38, 27, 31, 22, 26, 18, 21, 12];

function HeroChart() {
  const W = 480, H = 260;
  const step = W / (CHART_POINTS.length - 1);
  const pts = CHART_POINTS.map((v, i) => [i * step, (v / 70) * H]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2962ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2962ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--px-border)" strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="url(#hero-area)" />
      <path d={line} fill="none" stroke="#2962ff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="5" fill="#2962ff" />
      <circle cx={lx} cy={ly} r="5" fill="none" stroke="#2962ff" strokeWidth="2">
        <animate attributeName="r" from="5" to="16" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.8" to="0" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ─── Franja de stacks (tipo "ticker tape") ─── */
const STACKS = [
  ['Next.js', '#f2f2f2'], ['React', '#61dafb'], ['Vite', '#a78bfa'], ['Node.js', '#3c873a'],
  ['Express', '#b2b5be'], ['Python', '#3776ab'], ['FastAPI', '#089981'], ['Flask', '#b2b5be'],
  ['Django', '#0c8f55'], ['PHP', '#777bb4'], ['Laravel', '#f23645'], ['Docker', '#2496ed'],
  ['PostgreSQL', '#4169e1'], ['MySQL', '#f29111'],
];

function StackTicker() {
  const items = [...STACKS, ...STACKS]; // duplicado para el loop continuo
  return (
    <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
      {/* paddingRight = gap: así el -50% del loop cae justo al inicio de la copia */}
      <div className="swiss-marquee" style={{ gap: 12, paddingRight: 12 }}>
        {items.map(([name, color], i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 999, border: '1px solid var(--px-border)', background: 'var(--px-surface)',
            fontSize: 15, fontWeight: 600, color: 'var(--px-white)', whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Encabezado de sección ─── */
function SectionHeader({ title, sub }) {
  return (
    <Reveal style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 56px' }}>
      <h2 style={{ fontWeight: 800, fontSize: 'clamp(34px, 5vw, 60px)', color: 'var(--px-white)', margin: 0, letterSpacing: '-0.035em', lineHeight: 1.05 }}>{title}</h2>
      {sub && <p style={{ fontSize: 'clamp(16px, 1.6vw, 19px)', color: 'var(--px-muted)', margin: '18px auto 0', lineHeight: 1.6, maxWidth: 640 }}>{sub}</p>}
    </Reveal>
  );
}

const section = { padding: 'clamp(80px, 10vw, 128px) 24px' };
const container = { maxWidth: 1200, margin: '0 auto' };

/* ═══════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════ */
export default function Home() {
  const h = useTranslation().home;

  const featureIcons = [<DeployIcon size={24}/>, <ShieldIcon size={24}/>, <GlobeIcon size={24}/>, <ChartIcon size={24}/>];
  const stepIcons = [<CommitIcon size={22}/>, <BuildIcon size={22}/>, <GlobeIcon size={22}/>];

  return (
    <div className="page-transition" style={{ overflowX: 'hidden' }}>

      {/* ══ HERO ═══════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', padding: 'clamp(72px, 10vw, 120px) 24px 64px', textAlign: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(55% 45% at 50% 0%, var(--px-glow-blue), transparent 70%)' }} />

        <div style={{ position: 'relative', ...container }}>
          <div className="fade-up"><span className="px-badge">{h.badge}</span></div>

          <h1 className="fade-up fade-up-1" style={{ margin: '28px auto 24px', fontWeight: 800, fontSize: 'clamp(52px, 10vw, 128px)', letterSpacing: '-0.045em', lineHeight: 0.98, color: 'var(--px-white)' }}>
            {h.h1_1}
            <br />
            <span style={{ background: 'linear-gradient(90deg, #2962ff, #7aa2ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{h.h1_2}</span>
          </h1>

          <p className="fade-up fade-up-2" style={{ fontSize: 'clamp(17px, 2vw, 21px)', color: 'var(--px-muted)', maxWidth: 660, margin: '0 auto', lineHeight: 1.55 }}>
            {h.subtitle}
          </p>

          <div className="fade-up fade-up-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 36 }}>
            <Link to="/deploy" className="px-btn" style={{ textDecoration: 'none', padding: '15px 30px', fontSize: 17 }}>{h.cta_start}</Link>
            <a href="#como-funciona" className="px-btn-ghost" style={{ textDecoration: 'none', padding: '15px 30px', fontSize: 17 }}>{h.cta_explore}</a>
          </div>

          {/* Tarjeta principal: terminal + gráfico */}
          <div className="fade-up fade-up-4 tv-card home-hero-card" style={{ marginTop: 72, textAlign: 'left', overflow: 'hidden', boxShadow: 'var(--px-shadow-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--px-border)' }}>
              {['#f23645', '#f29111', '#089981'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
              <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--px-muted)', fontFamily: "'JetBrains Mono',monospace" }}>mission-control — deploy</span>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--px-green)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--px-green)' }} />
                {h.live_simulation}
              </span>
            </div>
            <div className="home-hero-grid">
              <div style={{ padding: '24px 28px', minHeight: 300 }}><LiveTerminal /></div>
              <div className="home-hero-chart"><HeroChart /></div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ STACKS ═════════════════════════════════════════════════ */}
      <section style={{ padding: '24px 0 40px' }}>
        <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--px-muted)', margin: '0 0 20px', padding: '0 24px' }}>{h.stacks_label}</p>
        <StackTicker />
      </section>

      {/* ══ FEATURES ═══════════════════════════════════════════════ */}
      <section id="features" style={section}>
        <div style={container}>
          <SectionHeader title={h.features_title} sub={h.features_sub} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
            {h.cards.map((c, i) => (
              <Reveal key={c.title} delay={i * 70} style={{ height: '100%' }}>
                <div className="tv-card" style={{ padding: 'clamp(28px, 4vw, 40px)', height: '100%', boxSizing: 'border-box' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--px-accent-soft)', color: 'var(--px-accent)', marginBottom: 28 }}>
                    {featureIcons[i]}
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 24, color: 'var(--px-white)', margin: '0 0 12px', letterSpacing: '-0.02em' }}>{c.title}</h3>
                  <p style={{ fontSize: 16, color: 'var(--px-muted)', margin: 0, lineHeight: 1.65 }}>{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CÓMO FUNCIONA ══════════════════════════════════════════ */}
      <section id="como-funciona" style={{ ...section, background: 'var(--px-bg2)' }}>
        <div style={container}>
          <SectionHeader title={h.timeline_title} sub={h.timeline_sub} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {h.timeline_steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 80} style={{ height: '100%' }}>
                <div className="tv-card" style={{ padding: 32, height: '100%', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                    <span style={{ fontWeight: 800, fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--px-accent)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ color: 'var(--px-muted)' }}>{stepIcons[i]}</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 21, color: 'var(--px-white)', margin: '0 0 10px', letterSpacing: '-0.015em' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, color: 'var(--px-muted)', margin: 0, lineHeight: 1.65 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ════════════════════════════════════════════════════ */}
      <section style={section}>
        <Reveal style={container}>
          <div style={{
            borderRadius: 'var(--px-radius-xl)', padding: 'clamp(56px, 8vw, 96px) 24px', textAlign: 'center',
            background: 'radial-gradient(80% 120% at 50% 0%, #4f7dff 0%, #2962ff 45%, #1a3fb8 100%)', color: '#fff',
          }}>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(34px, 5.5vw, 64px)', margin: '0 auto 18px', letterSpacing: '-0.035em', lineHeight: 1.05, maxWidth: 820 }}>{h.cta_title}</h2>
            <p style={{ fontSize: 'clamp(16px, 1.6vw, 19px)', margin: '0 auto 36px', lineHeight: 1.6, maxWidth: 600, color: 'rgba(255,255,255,0.85)' }}>{h.cta_sub}</p>
            <Link to="/deploy" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none',
              padding: '15px 32px', borderRadius: 999, background: '#fff', color: '#131722',
              fontSize: 17, fontWeight: 700, transition: 'transform 0.15s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
            >
              {h.cta_btn}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ═════════════════════════════════════════════════ */}
      <footer style={{ padding: '64px 24px 40px', borderTop: '1px solid var(--px-border)' }}>
        <div style={container}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40, marginBottom: 56 }}>
            <div>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <BrandMark size={30} />
                <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--px-white)', letterSpacing: '-0.02em' }}>StarDest</span>
              </Link>
            </div>
            {h.footer.columns.map(({ title, links }) => (
              <div key={title}>
                <h4 style={{ fontWeight: 700, fontSize: 15, color: 'var(--px-white)', margin: '0 0 16px' }}>{title}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {links.map(l => (
                    <li key={l}><a href="#" className="home-footer-link">{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--px-border)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 14, color: 'var(--px-muted)' }}>
            <p style={{ margin: 0 }}>{h.footer.copy}</p>
            <div style={{ display: 'flex', gap: 24 }}>
              {[h.footer.status, h.footer.sla].map(l => <a key={l} href="#" className="home-footer-link">{l}</a>)}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
