import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { LogoMark, DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';

/** Lightweight hook: re-renders when theme/lang changes */
function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
}

/* ─── Mission step card ─── */
function MissionStep({ num, icon, title, desc, active }) {
  const isDark = useTheme();
  const t = useTranslation();
  const cardBg = isDark ? 'var(--px-surface)' : '#ffffff';
  const titleColor = 'var(--px-white)';
  return (
    <div style={{
      display:'flex', gap:20, alignItems:'flex-start',
      padding:'24px 28px',
      background: cardBg,
      border:`1px solid ${active ? 'var(--px-border-glow)' : 'var(--px-border)'}`,
      borderRadius: 14,
      transition:'all 0.2s',
    }}>
      <div style={{
        flexShrink:0, width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center',
        border:'1px solid var(--px-border)', borderRadius: 12, background: 'var(--px-bg)',
      }}>{icon}</div>
      <div>
        <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:11, color:'var(--px-muted)', marginBottom:4, letterSpacing:'0.12em', textTransform:'uppercase' }}>{t.home.step_label} {num}</div>
        <h3 style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:18, color: titleColor, margin:'0 0 8px' }}>{title}</h3>
        <p style={{ fontFamily:"'Inter',sans-serif", fontSize:15, color:'var(--px-muted)', margin:0, lineHeight:1.6 }}>{desc}</p>
      </div>
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, tag }) {
  const [hov, setHov] = useState(false);
  const isDark = useTheme();
  const cardBg = isDark
    ? (hov ? 'var(--px-bg2)' : 'var(--px-surface)')
    : (hov ? '#fafafa' : '#ffffff');
  const titleColor = 'var(--px-white)';
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding:'28px 24px',
        background: cardBg,
        border:`1px solid ${hov ? 'var(--px-border-glow)' : 'var(--px-border)'}`,
        borderRadius: 14,
        transform: hov ? 'translateY(-2px)' : 'none',
        transition:'all 0.15s ease',
        cursor:'default',
      }}
    >
      <div style={{ marginBottom:16 }}>{icon}</div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:11, color:'var(--px-muted)', marginBottom:8, letterSpacing:'0.12em', textTransform:'uppercase' }}>{tag}</div>
      <h3 style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:18, color: titleColor, margin:'0 0 10px' }}>{title}</h3>
      <p style={{ fontFamily:"'Inter',sans-serif", fontSize:15, color:'var(--px-muted)', margin:0, lineHeight:1.6 }}>{desc}</p>
    </div>
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
    lines.forEach((l, i) => {
      setTimeout(() => setVisible(v => [...v, i]), l.t);
    });
    const loop = setInterval(() => {
      setVisible([]);
      lines.forEach((l, i) => setTimeout(() => setVisible(v => [...v, i]), l.t));
    }, 8000);
    return () => clearInterval(loop);
  }, []);
  return (
    <div className="px-terminal" style={{ minHeight:220 }}>
      <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid var(--px-border)', paddingBottom:12, alignItems:'center' }}>
        {[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--px-border-glow)'}}/>)}
        <span style={{ marginLeft:8, color:'var(--px-muted)', fontSize:12 }}>mission-control — deploy</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          color: 'var(--px-white)', fontSize:13, lineHeight:1.8, marginBottom:2,
          opacity: visible.includes(i) ? 1 : 0,
          transform: visible.includes(i) ? 'none' : 'translateX(-8px)',
          transition:'opacity 0.3s, transform 0.3s',
        }}>{l.txt}</div>
      ))}
      {visible.length === lines.length && (
        <span className="px-cursor"></span>
      )}
    </div>
  );
}

/* ─── Main ─── */
export default function Home() {
  const t = useTranslation();
  const h = t.home;
  const isDark = useTheme();

  const featureIcons = [
    <DeployIcon size={28} style={{ color: 'var(--px-white)' }} />,
    <ShieldIcon size={28} style={{ color: 'var(--px-white)' }} />,
    <GlobeIcon size={28} style={{ color: 'var(--px-white)' }} />,
    <ChartIcon size={28} style={{ color: 'var(--px-white)' }} />,
  ];
  const features = h.cards.map((card, i) => ({
    icon: featureIcons[i],
    tag: h.feature_tags[i],
    title: card.title,
    desc: card.desc,
  }));

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'var(--px-bg)', overflowX:'hidden' }}>

      <div style={{ position:'relative', zIndex:2 }}>

        {/* ══ HERO ══ */}
        <section style={{ padding:'120px 24px 80px', textAlign:'center', position:'relative' }}>

          {/* Main heading */}
          <h1 style={{ margin:'0 0 24px', lineHeight:1.1 }}>
            <span style={{
              display:'block', fontFamily:"'Inter',sans-serif", fontWeight:800,
              fontSize:'clamp(40px, 7vw, 84px)',
              color:'var(--px-white)',
              marginBottom:8,
              letterSpacing:'-0.02em',
            }}>
              {h.h1_1}
            </span>
            <span style={{
              display:'block', fontFamily:"'Inter',sans-serif", fontWeight:800,
              fontSize:'clamp(40px, 7vw, 84px)',
              color:'var(--px-muted)',
              letterSpacing:'-0.02em',
            }}>
              {h.h1_2}
            </span>
          </h1>

          <p style={{
            fontFamily:"'Inter',sans-serif", fontSize:18, color:'var(--px-muted)',
            maxWidth:580, margin:'0 auto 48px', lineHeight:1.6,
          }}>
            {h.subtitle}
          </p>

          {/* CTA buttons */}
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
            <Link to="/deploy" className="px-btn" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontSize:15, padding:'14px 32px',
            }}>
              {h.cta_start}
            </Link>
            <a href="#como-funciona" className="px-btn-cyan px-border" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:15,
              padding:'14px 32px', borderRadius: 8, color:'var(--px-white)',
            }}>
              {h.cta_explore}
            </a>
          </div>

        </section>

        {/* ══ CÓMO FUNCIONA — Mission Control ══ */}
        <section id="como-funciona" style={{ padding:'80px 24px', background: 'var(--px-bg2)' }}>
          <div style={{ maxWidth:900, margin:'0 auto' }}>
            {/* Section header */}
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:48 }}>
              <div style={{ flex:1, height:1, background:'var(--px-border)' }} />
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:11, color:'var(--px-muted)', letterSpacing:'0.18em', marginBottom:8 }}>{h.how_it_works}</div>
                <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:28, color: 'var(--px-white)', margin:0 }}>{h.timeline_title}</h2>
              </div>
              <div style={{ flex:1, height:1, background:'var(--px-border)' }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Steps */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <MissionStep num={1} icon={<CommitIcon size={24} style={{ color: 'var(--px-white)' }} />} title={h.timeline_steps[0].title} desc={h.timeline_steps[0].desc} active />
                <MissionStep num={2} icon={<BuildIcon size={24} style={{ color: 'var(--px-white)' }} />}  title={h.timeline_steps[1].title} desc={h.timeline_steps[1].desc} />
                <MissionStep num={3} icon={<GlobeIcon size={24} style={{ color: 'var(--px-white)' }} />}  title={h.timeline_steps[2].title} desc={h.timeline_steps[2].desc} />
              </div>

              {/* Live terminal */}
              <div>
                <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:11, color:'var(--px-muted)', marginBottom:12, letterSpacing:'0.15em' }}>
                  ● {h.live_simulation}
                </div>
                <LiveTerminal />
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES — Orbit Grid ══ */}
        <section id="features" style={{ padding:'80px 24px' }}>
          <div style={{ maxWidth:1000, margin:'0 auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:48 }}>
              <div style={{ flex:1, height:1, background:'var(--px-border)' }} />
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:600, fontSize:11, color:'var(--px-muted)', letterSpacing:'0.18em', marginBottom:8 }}>{h.features_label}</div>
                <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:28, color: 'var(--px-white)', margin:0 }}>{h.features_title}</h2>
              </div>
              <div style={{ flex:1, height:1, background:'var(--px-border)' }} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
              {features.map(f => <FeatureCard key={f.title} {...f} />)}
            </div>
          </div>
        </section>

        {/* ══ CTA FINAL ══ */}
        <section style={{ padding:'80px 24px 100px' }}>
          <div className="px-6 py-10 sm:px-10 sm:py-16" style={{
            maxWidth:760, margin:'0 auto', textAlign:'center',
            background: 'var(--px-surface)',
            border: '1px solid var(--px-border)',
            borderRadius: 20,
          }}>
            <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:30, color: 'var(--px-white)', margin:'0 0 16px' }}>{h.cta_title}</h2>
            <p style={{ fontFamily:"'Inter',sans-serif", fontSize:17, color:'var(--px-muted)', margin:'0 0 36px', lineHeight:1.6 }}>{h.cta_sub}</p>
            <Link to="/deploy" className="px-btn" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontSize:15, padding:'16px 40px',
            }}>
              {h.cta_btn}
            </Link>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{ borderTop:'1px solid var(--px-border)', background: 'var(--px-bg2)', padding:'48px 24px 28px' }}>
          <div style={{ maxWidth:1000, margin:'0 auto' }}>
            {/* Logo */}
            <div style={{ marginBottom:40, display:'flex', alignItems:'center', gap:16 }}>
              <LogoMark size={24} style={{ color: 'var(--px-white)' }} />
              <span style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:18, color: 'var(--px-white)' }}>StarDest</span>
              <span style={{ fontFamily:"'Inter',sans-serif", fontSize:12, color:'var(--px-muted)', marginLeft:4 }}>// Cloud PaaS</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:36, marginBottom:40 }}>
              {h.footer.columns.map(({ title, links }) => (
                <div key={title}>
                  <h4 style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:12, color:'var(--px-white)', marginBottom:16, textTransform:'uppercase', letterSpacing:'0.1em' }}>{title}</h4>
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:10 }}>
                    {links.map(l => (
                      <li key={l}>
                        <a href="#" style={{ fontFamily:"'Inter',sans-serif", fontSize:14, color:'var(--px-muted)', textDecoration:'none' }}
                          onMouseEnter={e => e.target.style.color='var(--px-white)'}
                          onMouseLeave={e => e.target.style.color='var(--px-muted)'}
                        >{l}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ borderTop:'1px solid var(--px-border)', paddingTop:24,
              display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12,
              fontFamily:"'Inter',sans-serif", fontSize:13, color:'var(--px-muted)' }}>
              <p style={{ margin:0 }}>{h.footer.copy}</p>
              <div style={{ display:'flex', gap:24 }}>
                <a href="#" style={{ color:'var(--px-muted)', textDecoration:'none' }}>{h.footer.status}</a>
                <a href="#" style={{ color:'var(--px-muted)', textDecoration:'none' }}>{h.footer.sla}</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
