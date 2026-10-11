import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';
import BrandMark from '../components/BrandMark';
import VideoBackground from '../components/VideoBackground';

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
      <VideoBackground />

      {/* ══ HERO ═══════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', padding: 'clamp(96px, 12vw, 160px) 24px clamp(48px, 6vw, 80px)', textAlign: 'center' }}>

        <div style={{ position: 'relative', ...container }}>

          <h1 className="fade-up fade-up-1" style={{ margin: '0 auto 24px', fontWeight: 800, fontSize: 'clamp(52px, 10vw, 128px)', letterSpacing: '-0.045em', lineHeight: 0.98, color: 'var(--px-white)' }}>
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

        </div>
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
      <section id="como-funciona" style={section}>
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
            background: 'radial-gradient(80% 120% at 50% 0%, rgba(79,125,255,0.85) 0%, rgba(41,98,255,0.78) 45%, rgba(26,63,184,0.82) 100%)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 24px 64px rgba(41,98,255,0.25)',
            backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)',
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
