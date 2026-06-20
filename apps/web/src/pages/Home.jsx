import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { LogoMark, DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';

/* ─── Scroll-reveal wrapper ─── */
function Reveal({ children, delay = 0, as: Tag = 'div', style = {}, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } },
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

/* ─── Animated counting number ─── */
function Counter({ value, suffix = '' }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return;
      started.current = true;
      obs.disconnect();
      const end = parseInt(value, 10);
      const dur = 1400;
      const step = end / (dur / 16);
      let cur = 0;
      const t = setInterval(() => {
        cur = Math.min(cur + step, end);
        setN(Math.floor(cur));
        if (cur >= end) clearInterval(t);
      }, 16);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);
  return <span ref={ref}>{n}{suffix}</span>;
}

/* ─── Stat card ─── */
function StatCard({ value, suffix, label }) {
  return (
    <div style={{
      padding: '24px 28px',
      border: '1px solid var(--px-border)',
      borderRadius: 'var(--px-radius)',
      background: 'var(--px-surface)',
      boxShadow: 'var(--px-shadow-sm)',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontWeight: 900,
        fontSize: 'clamp(28px, 4vw, 42px)',
        color: 'var(--px-white)', lineHeight: 1, marginBottom: 6,
        letterSpacing: '-0.02em',
      }}>
        <Counter value={value} suffix={suffix} />
      </div>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500,
        color: 'var(--px-muted)', letterSpacing: '0.02em',
      }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Step card ─── */
function StepCard({ num, icon, title, desc, delay = 0 }) {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={delay} style={{ flex: 1, minWidth: 200 }}>
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          padding: '32px 28px',
          border: `1px solid ${hov ? 'var(--px-red)' : 'var(--px-border)'}`,
          borderRadius: 'var(--px-radius)',
          background: 'var(--px-surface)',
          boxShadow: hov ? 'var(--px-shadow-hover)' : 'var(--px-shadow-sm)',
          transform: hov ? 'translateY(-4px)' : 'none',
          transition: 'all 0.25s ease',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${hov ? 'var(--px-red)' : 'var(--px-border)'}`,
            borderRadius: 'var(--px-radius-sm)',
            background: hov ? 'rgba(255,43,0,0.08)' : 'var(--px-bg)',
            color: hov ? 'var(--px-red)' : 'var(--px-white)',
            transition: 'all 0.25s ease',
          }}>{icon}</div>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
            fontSize: 13, color: hov ? 'var(--px-red)' : 'var(--px-muted)',
            letterSpacing: '0.08em', transition: 'color 0.25s ease',
          }}>0{num}</span>
        </div>
        <h3 style={{
          fontFamily: "'Inter',sans-serif", fontWeight: 800,
          fontSize: 18, color: 'var(--px-white)',
          margin: '0 0 10px', letterSpacing: '-0.01em',
        }}>{title}</h3>
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 14,
          color: 'var(--px-muted)', margin: 0, lineHeight: 1.65,
        }}>{desc}</p>
      </div>
    </Reveal>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, tag, num, delay = 0 }) {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={delay}>
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          padding: '32px 28px',
          border: `1px solid ${hov ? 'var(--px-border-glow)' : 'var(--px-border)'}`,
          borderRadius: 'var(--px-radius)',
          background: hov ? 'var(--px-bg2)' : 'var(--px-surface)',
          boxShadow: hov ? 'var(--px-shadow-hover)' : 'var(--px-shadow-sm)',
          transform: hov ? 'translateY(-3px)' : 'none',
          transition: 'all 0.25s ease',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Number watermark */}
        <span style={{
          position: 'absolute', top: 20, right: 20,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: '0.1em', color: hov ? 'rgba(255,43,0,0.25)' : 'var(--px-border)',
          transition: 'color 0.25s ease',
        }}>{String(num).padStart(2, '0')}</span>
        <div style={{ marginBottom: 20, color: hov ? 'var(--px-red)' : 'var(--px-white)', transition: 'color 0.25s ease' }}>{icon}</div>
        <div style={{
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
          fontSize: 10, color: 'var(--px-muted)', marginBottom: 10,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{tag}</div>
        <h3 style={{
          fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18,
          color: 'var(--px-white)', margin: '0 0 10px', letterSpacing: '-0.01em',
        }}>{title}</h3>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--px-muted)', margin: 0, lineHeight: 1.65 }}>{desc}</p>
      </div>
    </Reveal>
  );
}

/* ─── Live terminal ─── */
function LiveTerminal() {
  const tr = useTranslation();
  const delays = [0, 800, 1600, 2400, 3400, 4200, 5000, 5800];
  const lines = tr.home.terminal_lines.map((txt, i) => ({ t: delays[i], txt }));
  const [visible, setVisible] = useState([]);
  useEffect(() => {
    setVisible([]);
    lines.forEach((l, i) => { setTimeout(() => setVisible(v => [...v, i]), l.t); });
    const loop = setInterval(() => {
      setVisible([]);
      lines.forEach((l, i) => setTimeout(() => setVisible(v => [...v, i]), l.t));
    }, 9000);
    return () => clearInterval(loop);
  }, []);
  return (
    <div className="px-terminal" style={{ borderLeft: '2px solid var(--px-red)', minHeight: 220 }}>
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16,
        borderBottom: '1px solid var(--px-border)', paddingBottom: 12, alignItems: 'center',
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? 'var(--px-red)' : i === 1 ? '#ffb400' : 'var(--px-border)' }} />
        ))}
        <span style={{ marginLeft: 8, color: 'var(--px-muted)', fontSize: 12, letterSpacing: '0.05em', fontFamily: 'var(--px-font-mono)' }}>
          mission-control — deploy
        </span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          color: l.txt.startsWith('  ✓') ? '#4ade80' : l.txt.startsWith('  >>') ? 'var(--px-red)' : 'var(--px-muted)',
          fontFamily: 'var(--px-font-mono)', fontSize: 13, lineHeight: 2, marginBottom: 2,
          opacity: visible.includes(i) ? 1 : 0,
          transform: visible.includes(i) ? 'none' : 'translateX(-8px)',
          transition: 'opacity 0.3s, transform 0.3s',
        }}>{l.txt}</div>
      ))}
      {visible.length === lines.length && <span className="px-cursor" />}
    </div>
  );
}

/* ─── Marquee ticker ─── */
function Ticker({ text }) {
  const items = Array(10).fill(text);
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid var(--px-border)',
      borderBottom: '1px solid var(--px-border)',
      padding: '12px 0',
      background: 'var(--px-bg2)',
    }}>
      <div className="swiss-marquee">
        {[...items, ...items].map((t, i) => (
          <span key={i} style={{
            fontFamily: "'Inter',sans-serif", fontWeight: 700,
            fontSize: 13, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: 'var(--px-muted)',
            whiteSpace: 'nowrap', padding: '0 28px',
            display: 'flex', alignItems: 'center', gap: 28,
          }}>
            {t} <span style={{ color: 'var(--px-red)', fontSize: 8 }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Section header ─── */
function SectionHeader({ index, title, sub }) {
  return (
    <Reveal style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 12,
          color: 'var(--px-red)', letterSpacing: '0.12em',
          padding: '4px 10px', border: '1px solid rgba(255,43,0,0.2)',
          borderRadius: 999, background: 'rgba(255,43,0,0.06)',
          whiteSpace: 'nowrap', marginTop: 8,
        }}>{String(index).padStart(2,'0')}</span>
        <div>
          <h2 style={{
            fontFamily: "'Inter',sans-serif", fontWeight: 900,
            fontSize: 'clamp(28px, 5vw, 48px)', color: 'var(--px-white)',
            margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1,
          }}>{title}</h2>
          {sub && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-muted)', margin: '12px 0 0', lineHeight: 1.6, maxWidth: 600 }}>{sub}</p>}
        </div>
      </div>
    </Reveal>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════ */
export default function Home() {
  const t = useTranslation();
  const h = t.home;

  const stats = [
    { value: '1000', suffix: '+', label: h.timeline_steps ? 'Deploys totales' : 'Total Deploys' },
    { value: '99',   suffix: '.9%', label: 'Uptime garantizado' },
    { value: '60',   suffix: 's',   label: 'Tiempo promedio de deploy' },
    { value: '5',    suffix: '+',   label: 'Lenguajes soportados' },
  ];

  const featureIcons = [
    <DeployIcon size={26} />, <ShieldIcon size={26} />, <GlobeIcon size={26} />, <ChartIcon size={26} />,
  ];
  const features = h.cards.map((card, i) => ({
    icon: featureIcons[i], tag: h.feature_tags[i],
    title: card.title, desc: card.desc, num: i + 1,
  }));

  const steps = [
    { icon: <CommitIcon size={20} />, title: h.timeline_steps[0].title, desc: h.timeline_steps[0].desc },
    { icon: <BuildIcon  size={20} />, title: h.timeline_steps[1].title, desc: h.timeline_steps[1].desc },
    { icon: <GlobeIcon  size={20} />, title: h.timeline_steps[2].title, desc: h.timeline_steps[2].desc },
  ];

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--px-bg)', overflowX: 'hidden' }}>

      {/* ══ HERO ══════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', padding: '96px 24px 64px' }}>

        {/* Background layers */}
        <div className="grid-overlay" />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 55% at 50% -5%, rgba(255,43,0,0.13) 0%, transparent 65%)',
        }} />

        {/* Animated blobs */}
        <div className="hero-blob" style={{
          width: 500, height: 500, top: '-10%', left: '-8%',
          background: 'radial-gradient(circle, rgba(255,43,0,0.08) 0%, transparent 65%)',
          animationDuration: '16s',
        }} />
        <div className="hero-blob" style={{
          width: 400, height: 400, top: '5%', right: '-5%',
          background: 'radial-gradient(circle, rgba(255,100,60,0.06) 0%, transparent 65%)',
          animationDuration: '20s', animationDelay: '-7s',
        }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>

          {/* Badge */}
          <div className="fade-up" style={{ marginBottom: 28 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px',
              border: '1px solid rgba(255,43,0,0.25)',
              borderRadius: 999,
              background: 'rgba(255,43,0,0.07)',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600,
              color: 'var(--px-red)', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              <span style={{ width: 6, height: 6, background: 'var(--px-red)', borderRadius: '50%', boxShadow: '0 0 6px var(--px-red)' }} />
              {h.badge}
            </span>
          </div>

          {/* Headline */}
          <h1 className="fade-up fade-up-1" style={{ margin: '0 0 28px', lineHeight: 0.95, letterSpacing: '-0.035em' }}>
            <span style={{
              display: 'block', fontFamily: "'Inter',sans-serif", fontWeight: 900,
              fontSize: 'clamp(52px, 11vw, 136px)', color: 'var(--px-white)',
            }}>{h.h1_1}</span>
            <span style={{
              display: 'block', fontFamily: "'Inter',sans-serif", fontWeight: 900,
              fontSize: 'clamp(52px, 11vw, 136px)',
              background: 'linear-gradient(135deg, #ff2b00 0%, #ff6a3d 60%, #ff9a7a 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>{h.h1_2}</span>
          </h1>

          {/* Subtitle + CTAs */}
          <div className="fade-up fade-up-2" style={{
            display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--px-border)', paddingTop: 32, marginBottom: 56,
          }}>
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 18, color: 'var(--px-muted)',
              maxWidth: 520, margin: 0, lineHeight: 1.65, fontWeight: 400,
            }}>{h.subtitle}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/deploy" className="px-btn" style={{
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 14, padding: '14px 28px',
              }}>
                {h.cta_start}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="#como-funciona" className="px-btn-cyan px-border" style={{
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14,
                padding: '14px 28px', color: 'var(--px-white)',
              }}>
                {h.cta_explore}
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="fade-up fade-up-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stats.map(s => <StatCard key={s.label} {...s} />)}
          </div>
        </div>
      </section>

      {/* ══ TICKER ══════════════════════════════════════════════════════ */}
      <Ticker text={`${h.h1_1} ${h.h1_2}`} />

      {/* ══ STEPS ═══════════════════════════════════════════════════════ */}
      <section id="como-funciona" style={{ padding: 'clamp(72px, 10vw, 100px) 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader index={1} title={h.timeline_title} sub={h.timeline_sub} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {steps.map((s, i) => (
              <StepCard key={i} num={i + 1} icon={s.icon} title={s.title} desc={s.desc} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: 'clamp(72px, 10vw, 100px) 24px', borderTop: '1px solid var(--px-border)', background: 'var(--px-bg2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader index={2} title={h.features_title} sub={h.features_sub} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {features.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 70} />)}
          </div>
        </div>
      </section>

      {/* ══ TERMINAL DEMO ═══════════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(72px, 10vw, 100px) 24px', borderTop: '1px solid var(--px-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }} className="grid-cols-1 md:grid-cols-2">
            <div>
              <SectionHeader index={3} title={h.how_it_works} />
              <Reveal delay={100}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {steps.map((s, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <span style={{
                        flexShrink: 0, width: 32, height: 32,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                        background: 'var(--px-surface)', color: 'var(--px-red)',
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700,
                      }}>0{i+1}</span>
                      <div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--px-white)', marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--px-muted)', lineHeight: 1.6 }}>{s.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <Reveal delay={120}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--px-muted)', marginBottom: 10, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--px-red)', boxShadow: '0 0 6px var(--px-red)', display: 'inline-block' }} />
                {h.live_simulation}
              </div>
              <LiveTerminal />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CTA ═════════════════════════════════════════════════════════ */}
      <section>
        <Reveal>
          <div style={{
            padding: 'clamp(64px, 10vw, 96px) clamp(24px, 6vw, 80px)',
            background: 'var(--px-red)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 28,
          }}>
            {/* Subtle noise on red block */}
            <div className="noise-overlay" style={{ opacity: 0.04 }} />
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse 70% 80% at 100% 50%, rgba(255,255,255,0.06) 0%, transparent 60%)',
            }} />
            <div style={{ position: 'relative', zIndex: 1, maxWidth: 800 }}>
              <h2 style={{
                fontFamily: "'Inter',sans-serif", fontWeight: 900,
                fontSize: 'clamp(36px, 8vw, 88px)', color: '#ffffff',
                margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 0.97,
              }}>{h.cta_title}</h2>
              <p style={{
                fontFamily: "'Inter',sans-serif", fontSize: 18,
                color: 'rgba(255,255,255,0.8)', margin: '0 0 32px', lineHeight: 1.6, maxWidth: 520,
              }}>{h.cta_sub}</p>
              <Link to="/deploy" style={{
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
                fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 14,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '16px 32px', background: '#ffffff', color: 'var(--px-red)',
                borderRadius: 'var(--px-radius-sm)', border: '1px solid #ffffff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}
              >
                {h.cta_btn}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer style={{ padding: 'clamp(48px, 6vw, 64px) 24px 32px', borderTop: '1px solid var(--px-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <LogoMark size={20} style={{ color: 'var(--px-white)' }} />
            <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 16, color: 'var(--px-white)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>StarDest</span>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-red)',
              padding: '2px 8px', border: '1px solid rgba(255,43,0,0.25)', borderRadius: 999,
              letterSpacing: '0.08em',
            }}>Cloud PaaS</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 40, marginBottom: 48, borderTop: '1px solid var(--px-border)', paddingTop: 40 }}>
            {h.footer.columns.map(({ title, links }) => (
              <div key={title}>
                <h4 style={{
                  fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
                  color: 'var(--px-white)', marginBottom: 16,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{title}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {links.map(l => (
                    <li key={l}>
                      <a href="#" className="swiss-link" style={{
                        fontFamily: "'Inter',sans-serif", fontSize: 14,
                        color: 'var(--px-muted)', transition: 'color 0.15s ease',
                      }}
                        onMouseEnter={e => e.target.style.color = 'var(--px-white)'}
                        onMouseLeave={e => e.target.style.color = 'var(--px-muted)'}
                      >{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid var(--px-border)', paddingTop: 24,
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--px-muted)',
          }}>
            <p style={{ margin: 0 }}>{h.footer.copy}</p>
            <div style={{ display: 'flex', gap: 24 }}>
              <a href="#" className="swiss-link" style={{ color: 'var(--px-muted)' }}>{h.footer.status}</a>
              <a href="#" className="swiss-link" style={{ color: 'var(--px-muted)' }}>{h.footer.sla}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
