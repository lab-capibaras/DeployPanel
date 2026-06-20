import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';
import { getPrefs, subscribePrefs } from '../store/prefs';

/* ─── Theme hook ─── */
function useTheme() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => subscribePrefs(setP), []);
  return p.theme === 'dark';
}

/* ─── Scroll-reveal ─── */
function Reveal({ children, delay = 0, as: Tag = 'div', style = {}, className = '' }) {
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
    <Tag ref={ref} className={`reveal ${className}`} style={{ '--reveal-delay': `${delay}ms`, ...style }}>
      {children}
    </Tag>
  );
}

/* ─── Scattered character canvas background ─── */
function ScatteredChars({ isDark }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const CHARS = 'LTF01+×─│┌┐└┘·∙◦←→↑↓∧∨⊕⊗'.split('');
    let items = [];
    let raf;

    const setup = () => {
      const W = window.innerWidth;
      const H = Math.max(canvas.parentElement?.offsetHeight || window.innerHeight, 600);
      canvas.width = W;
      canvas.height = H;
      items = Array.from({ length: 110 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        ch: CHARS[Math.floor(Math.random() * CHARS.length)],
        a: Math.random() * 0.07 + 0.02,
        sz: Math.floor(Math.random() * 5 + 9),
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.1,
      }));
    };
    setup();

    const onResize = () => { cancelAnimationFrame(raf); setup(); draw(); };
    window.addEventListener('resize', onResize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      items.forEach(it => {
        ctx.font = `${it.sz}px 'JetBrains Mono',monospace`;
        ctx.fillStyle = isDark ? `rgba(255,255,255,${it.a})` : `rgba(0,0,0,${it.a * 0.75})`;
        ctx.fillText(it.ch, it.x, it.y);
        it.x += it.vx; it.y += it.vy;
        if (it.x < -20) it.x = W + 5;
        if (it.x > W + 20) it.x = -5;
        if (it.y < -20) it.y = H + 5;
        if (it.y > H + 20) it.y = -5;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [isDark]);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}

/* ─── Animated SVG circle ─── */
function HeroCircle({ isDark }) {
  const a = (op) => isDark ? `rgba(255,255,255,${op})` : `rgba(0,0,0,${op})`;
  const R = 248;
  const dotAngles = [0, 60, 120, 180, 240, 300];
  const dots = dotAngles.map(deg => {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: 300 + R * Math.cos(rad), y: 300 + R * Math.sin(rad) };
  });

  return (
    <div className="hero-circle-container">
      <svg viewBox="0 0 600 600" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {/* Static ghost outer */}
        <circle cx="300" cy="300" r="285" fill="none" stroke={a(0.04)} strokeWidth="1" />

        {/* Rotating outer dashed ring + indicator dots */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0 300 300" to="360 300 300" dur="55s" repeatCount="indefinite" />
          <circle cx="300" cy="300" r={R} fill="none" stroke={a(0.15)} strokeWidth="1" strokeDasharray="3 11" />
          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="3.5" fill={a(0.28)} />)}
        </g>

        {/* Counter-rotating mid dashed ring */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0 300 300" to="-360 300 300" dur="38s" repeatCount="indefinite" />
          <circle cx="300" cy="300" r="188" fill="none" stroke={a(0.08)} strokeWidth="1" strokeDasharray="2 9" />
        </g>

        {/* Static inner ring */}
        <circle cx="300" cy="300" r="125" fill="none" stroke={a(0.05)} strokeWidth="1" />

        {/* Pulsing rings */}
        <circle cx="300" cy="300" r="30" fill="none" stroke={a(0.18)} strokeWidth="1">
          <animate attributeName="r" from="30" to="265" dur="4.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.25" to="0" dur="4.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="300" r="30" fill="none" stroke={a(0.12)} strokeWidth="1">
          <animate attributeName="r" from="30" to="265" dur="4.5s" begin="2.25s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.18" to="0" dur="4.5s" begin="2.25s" repeatCount="indefinite" />
        </circle>

        {/* Crosshair */}
        <line x1="283" y1="300" x2="317" y2="300" stroke={a(0.1)} strokeWidth="1" />
        <line x1="300" y1="283" x2="300" y2="317" stroke={a(0.1)} strokeWidth="1" />

        {/* Center dot */}
        <circle cx="300" cy="300" r="5" fill={a(0.18)} />
        <circle cx="300" cy="300" r="2" fill={a(0.45)} />
      </svg>
    </div>
  );
}

/* ─── Stats ticker ─── */
function StatTicker({ isDark }) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const muted  = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.42)';
  const main   = isDark ? '#fafafa' : '#09090b';
  const lang   = getPrefs().lang;

  const stats = lang === 'es' ? [
    { value: '1000+', label: 'deploys realizados',   tag: 'STARDEST' },
    { value: '60s',   label: 'tiempo de deploy',     tag: 'PROMEDIO' },
    { value: '99.9%', label: 'uptime garantizado',   tag: 'SLA' },
    { value: '5+',    label: 'lenguajes soportados', tag: 'RUNTIMES' },
  ] : [
    { value: '1000+', label: 'deployments done',     tag: 'STARDEST' },
    { value: '60s',   label: 'avg deploy time',      tag: 'AVERAGE'  },
    { value: '99.9%', label: 'guaranteed uptime',    tag: 'SLA'      },
    { value: '5+',    label: 'supported languages',  tag: 'RUNTIMES' },
  ];

  const items = [...stats, ...stats, ...stats];
  return (
    <div style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '14px 0', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', width: 'max-content', animation: 'swiss-marquee 40s linear infinite' }}>
        {items.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 44px', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 2.5vw, 30px)', color: main, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</span>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: muted, fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: muted, fontWeight: 600, letterSpacing: '0.1em' }}>{s.tag}</span>
            <span style={{ color: border, fontSize: 18, marginLeft: 12, lineHeight: 1 }}>◆</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, num, isDark, delay = 0 }) {
  const [hov, setHov] = useState(false);
  const border    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const borderHov = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
  const bg        = isDark ? '#18181b' : '#ffffff';
  const bgHov     = isDark ? '#1f1f23' : '#f8f8f9';
  const main      = isDark ? '#fafafa' : '#09090b';
  return (
    <Reveal delay={delay}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          padding: '28px 24px',
          border: `1px solid ${hov ? borderHov : border}`,
          borderRadius: 10, background: hov ? bgHov : bg,
          boxShadow: hov ? (isDark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.08)') : 'none',
          transform: hov ? 'translateY(-3px)' : 'none',
          transition: 'all 0.25s ease', position: 'relative', overflow: 'hidden',
        }}
      >
        <span style={{ position: 'absolute', top: 20, right: 20, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: hov ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)') : border, transition: 'color 0.25s ease' }}>{String(num).padStart(2,'0')}</span>
        <div style={{ marginBottom: 18, color: main }}>{icon}</div>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 17, color: main, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{title}</h3>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#71717a', margin: 0, lineHeight: 1.65 }}>{desc}</p>
      </div>
    </Reveal>
  );
}

/* ─── Step card ─── */
function StepCard({ num, icon, title, desc, isDark, delay = 0 }) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const bg     = isDark ? '#18181b' : '#ffffff';
  const main   = isDark ? '#fafafa' : '#09090b';
  return (
    <Reveal delay={delay} style={{ flex: 1, minWidth: 200 }}>
      <div style={{ padding: '28px 24px', border: `1px solid ${border}`, borderRadius: 10, background: bg, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${border}`, borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', color: main }}>{icon}</div>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, color: '#71717a', letterSpacing: '0.08em' }}>0{num}</span>
        </div>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 17, color: main, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{title}</h3>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#71717a', margin: 0, lineHeight: 1.65 }}>{desc}</p>
      </div>
    </Reveal>
  );
}

/* ─── Live terminal ─── */
function LiveTerminal({ isDark }) {
  const tr = useTranslation();
  const delays = [0, 800, 1600, 2400, 3400, 4200, 5000, 5800];
  const lines = tr.home.terminal_lines.map((txt, i) => ({ t: delays[i], txt }));
  const [visible, setVisible] = useState([]);
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const bg     = isDark ? '#111113' : '#f4f4f5';
  const main   = isDark ? '#fafafa' : '#09090b';

  useEffect(() => {
    setVisible([]);
    lines.forEach((l, i) => setTimeout(() => setVisible(v => [...v, i]), l.t));
    const loop = setInterval(() => {
      setVisible([]);
      lines.forEach((l, i) => setTimeout(() => setVisible(v => [...v, i]), l.t));
    }, 9000);
    return () => clearInterval(loop);
  }, []);

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '18px 20px', minHeight: 220 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, borderBottom: `1px solid ${border}`, paddingBottom: 12, alignItems: 'center' }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? '#ff3c3c' : i === 1 ? '#ffb400' : border }} />)}
        <span style={{ marginLeft: 8, color: '#71717a', fontSize: 12, letterSpacing: '0.05em', fontFamily: "'JetBrains Mono',monospace" }}>mission-control — deploy</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontFamily: "'JetBrains Mono',monospace",
          color: l.txt.startsWith('  ✓') ? '#4ade80' : l.txt.startsWith('  >>') ? main : '#71717a',
          fontSize: 13, lineHeight: 2.1, marginBottom: 1,
          opacity: visible.includes(i) ? 1 : 0,
          transform: visible.includes(i) ? 'none' : 'translateX(-8px)',
          transition: 'opacity 0.3s, transform 0.3s',
        }}>{l.txt}</div>
      ))}
      {visible.length === lines.length && <span className="px-cursor" />}
    </div>
  );
}

/* ─── Section header ─── */
function SectionHeader({ index, title, sub, isDark }) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const main   = isDark ? '#fafafa' : '#09090b';
  return (
    <Reveal style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 11, color: '#71717a', letterSpacing: '0.12em', padding: '4px 10px', border: `1px solid ${border}`, borderRadius: 999, whiteSpace: 'nowrap', marginTop: 9 }}>{String(index).padStart(2,'0')}</span>
        <div>
          <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: main, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1 }}>{title}</h2>
          {sub && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: '#71717a', margin: '12px 0 0', lineHeight: 1.6, maxWidth: 600 }}>{sub}</p>}
        </div>
      </div>
    </Reveal>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════ */
export default function Home() {
  const t = useTranslation();
  const h = t.home;
  const isDark = useTheme();

  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const main   = isDark ? '#fafafa' : '#09090b';
  const bg     = isDark ? '#09090b' : '#fafafa';
  const bg2    = isDark ? '#111113' : '#f4f4f5';
  const lang   = getPrefs().lang;
  const capLabel = lang === 'es' ? 'Capacidades' : 'Capabilities';

  const featureIcons = [<DeployIcon size={24}/>, <ShieldIcon size={24}/>, <GlobeIcon size={24}/>, <ChartIcon size={24}/>];
  const features = h.cards.map((c, i) => ({ icon: featureIcons[i], title: c.title, desc: c.desc, num: i + 1 }));
  const steps = [
    { icon: <CommitIcon size={18}/>, title: h.timeline_steps[0].title, desc: h.timeline_steps[0].desc },
    { icon: <BuildIcon  size={18}/>, title: h.timeline_steps[1].title, desc: h.timeline_steps[1].desc },
    { icon: <GlobeIcon  size={18}/>, title: h.timeline_steps[2].title, desc: h.timeline_steps[2].desc },
  ];

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: bg, overflowX: 'hidden' }}>

      {/* ══ HERO ═══════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', padding: '100px 24px 80px', overflow: 'hidden' }}>
        <ScatteredChars isDark={isDark} />
        <HeroCircle isDark={isDark} />

        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>

          {/* Eyebrow */}
          <div className="fade-up" style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 1, background: border, display: 'inline-block' }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717a' }}>{h.badge}</span>
            </div>
          </div>

          {/* Large headline */}
          <h1 className="fade-up fade-up-1 hero-headline" style={{ margin: '0 0 44px', letterSpacing: '-0.04em', lineHeight: 0.9 }}>
            <span style={{ display: 'block', fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 'clamp(60px, 12vw, 148px)', color: main }}>{h.h1_1}</span>
            <span style={{ display: 'block', fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 'clamp(60px, 12vw, 148px)', color: main }}>{h.h1_2}</span>
          </h1>

          {/* Subtitle + CTAs */}
          <div className="fade-up fade-up-2 hero-lower" style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start', justifyContent: 'space-between', borderTop: `1px solid ${border}`, paddingTop: 28 }}>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: '#71717a', maxWidth: 420, margin: 0, lineHeight: 1.65, fontWeight: 400 }}>{h.subtitle}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
              <Link to="/deploy"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 700, background: main, color: bg, border: `1px solid ${main}`, borderRadius: 999, transition: 'opacity 0.2s', letterSpacing: '0.01em' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {h.cta_start}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="#como-funciona"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, background: 'transparent', color: main, border: `1px solid ${border}`, borderRadius: 999, transition: 'border-color 0.2s', letterSpacing: '0.01em' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = border}
              >
                {h.cta_explore}
              </a>
            </div>
          </div>

          {/* Capabilities label */}
          <div className="fade-up fade-up-3" style={{ marginTop: 64, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 18, height: 1, background: border, display: 'inline-block' }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)' }}>{capLabel}</span>
          </div>
        </div>
      </section>

      {/* ══ STATS TICKER ════════════════════════════════════════════ */}
      <StatTicker isDark={isDark} />

      {/* ══ STEPS ═══════════════════════════════════════════════════ */}
      <section id="como-funciona" style={{ padding: 'clamp(80px, 10vw, 120px) 24px', background: bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader index={1} title={h.timeline_title} sub={h.timeline_sub} isDark={isDark} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {steps.map((s, i) => (
              <StepCard key={i} num={i+1} icon={s.icon} title={s.title} desc={s.desc} isDark={isDark} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: 'clamp(80px, 10vw, 120px) 24px', background: bg2, borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader index={2} title={h.features_title} sub={h.features_sub} isDark={isDark} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {features.map((f, i) => <FeatureCard key={f.title} {...f} isDark={isDark} delay={i * 70} />)}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS + TERMINAL ═════════════════════════════════ */}
      <section style={{ padding: 'clamp(80px, 10vw, 120px) 24px', borderTop: `1px solid ${border}`, background: bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="terminal-grid">
            <div>
              <SectionHeader index={3} title={h.how_it_works} isDark={isDark} />
              <Reveal delay={100}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {steps.map((s, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <span style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${border}`, borderRadius: 6, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', color: '#71717a', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700 }}>0{i+1}</span>
                      <div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 15, color: main, marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#71717a', lineHeight: 1.6 }}>{s.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <Reveal delay={120}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 11, color: '#71717a', marginBottom: 10, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }} />
                {h.live_simulation}
              </div>
              <LiveTerminal isDark={isDark} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CTA BAND ════════════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(80px, 10vw, 120px) 24px', borderTop: `1px solid ${border}`, background: bg2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ maxWidth: 720 }}>
                <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 'clamp(40px, 8vw, 96px)', color: main, margin: '0 0 20px', letterSpacing: '-0.04em', lineHeight: 0.92 }}>{h.cta_title}</h2>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: '#71717a', margin: 0, lineHeight: 1.6, maxWidth: 480 }}>{h.cta_sub}</p>
              </div>
              <Link to="/deploy"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 34px', fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 700, background: main, color: bg, borderRadius: 999, border: `1px solid ${main}`, transition: 'opacity 0.2s', whiteSpace: 'nowrap', boxShadow: isDark ? '0 4px 24px rgba(255,255,255,0.1)' : '0 4px 24px rgba(0,0,0,0.14)', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {h.cta_btn}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════ */}
      <footer style={{ padding: 'clamp(48px, 6vw, 64px) 24px 32px', borderTop: `1px solid ${border}`, background: bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <span style={{ width: 8, height: 8, background: main, display: 'inline-block' }} />
            <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 15, color: main, textTransform: 'uppercase', letterSpacing: '0.05em' }}>StarDest</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 40, marginBottom: 48, borderTop: `1px solid ${border}`, paddingTop: 40 }}>
            {h.footer.columns.map(({ title, links }) => (
              <div key={title}>
                <h4 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: main, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {links.map(l => (
                    <li key={l}>
                      <a href="#" style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#71717a', textDecoration: 'none', transition: 'color 0.15s ease' }}
                        onMouseEnter={e => e.target.style.color = main}
                        onMouseLeave={e => e.target.style.color = '#71717a'}
                      >{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#71717a' }}>
            <p style={{ margin: 0 }}>{h.footer.copy}</p>
            <div style={{ display: 'flex', gap: 24 }}>
              {[h.footer.status, h.footer.sla].map(l => (
                <a key={l} href="#" style={{ color: '#71717a', textDecoration: 'none', transition: 'color 0.15s ease' }}
                  onMouseEnter={e => e.target.style.color = main}
                  onMouseLeave={e => e.target.style.color = '#71717a'}
                >{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
