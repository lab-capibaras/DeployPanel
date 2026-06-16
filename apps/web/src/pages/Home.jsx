import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { LogoMark, DeployIcon, ShieldIcon, GlobeIcon, ChartIcon, CommitIcon, BuildIcon } from '../components/Icons';

/* ─── Mission step row (Swiss numbered list) ─── */
function MissionStep({ num, icon, title, desc, active }) {
  return (
    <div style={{
      display:'flex', gap:24, alignItems:'flex-start',
      padding:'24px 0',
      borderTop: '1px solid var(--px-border)',
      transition:'all 0.2s',
    }}>
      <div className="swiss-index" style={{ fontSize: 28, lineHeight: 1, color: active ? 'var(--px-red)' : 'var(--px-muted)', flexShrink: 0, minWidth: 40 }}>
        {String(num).padStart(2, '0')}
      </div>
      <div style={{
        flexShrink:0, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center',
        border:`1px solid ${active ? 'var(--px-red)' : 'var(--px-border)'}`, background: 'transparent',
      }}>{icon}</div>
      <div>
        <h3 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:18, color: 'var(--px-white)', margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'0.02em' }}>{title}</h3>
        <p style={{ fontFamily:"'Inter',sans-serif", fontSize:15, color:'var(--px-muted)', margin:0, lineHeight:1.6 }}>{desc}</p>
      </div>
    </div>
  );
}

/* ─── Feature card (Swiss grid cell) ─── */
function FeatureCard({ icon, title, desc, tag, num, className }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      className={className}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding:'28px 24px',
        background: 'transparent',
        border:`1px solid ${hov ? 'var(--px-red)' : 'var(--px-border)'}`,
        borderRadius: 0,
        transform: hov ? 'translateY(-4px)' : 'none',
        transition:'all 0.18s ease',
        cursor:'default',
        position: 'relative',
      }}
    >
      <div style={{ position:'absolute', top:16, right:20, fontFamily: "'JetBrains Mono',monospace", fontWeight:700, fontSize:12, letterSpacing:'0.1em', color: hov ? 'var(--px-red)' : 'var(--px-border-glow)' }}>
        {String(num).padStart(2,'0')}
      </div>
      <div style={{ marginBottom:20, color: hov ? 'var(--px-red)' : 'var(--px-white)', transition:'color 0.18s ease' }}>{icon}</div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:11, color:'var(--px-muted)', marginBottom:10, letterSpacing:'0.18em', textTransform:'uppercase' }}>{tag}</div>
      <h3 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:19, color: 'var(--px-white)', margin:'0 0 10px', textTransform:'uppercase' }}>{title}</h3>
      <p style={{ fontFamily:"'Inter',sans-serif", fontSize:14, color:'var(--px-muted)', margin:0, lineHeight:1.6 }}>{desc}</p>
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
    <div className="px-terminal" style={{ minHeight:240, borderLeft: '3px solid var(--px-red)' }}>
      <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid var(--px-border)', paddingBottom:12, alignItems:'center' }}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,background: i===0 ? 'var(--px-red)' : 'var(--px-border-glow)'}}/>)}
        <span style={{ marginLeft:8, color:'var(--px-muted)', fontSize:12, letterSpacing:'0.05em', textTransform:'uppercase' }}>mission-control — deploy</span>
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

/* ─── Marquee ticker ─── */
function Ticker({ text }) {
  const items = Array(8).fill(text);
  return (
    <div style={{ overflow:'hidden', borderTop:'1px solid var(--px-border)', borderBottom:'1px solid var(--px-border)', padding:'14px 0' }}>
      <div className="swiss-marquee">
        {[...items, ...items].map((t, i) => (
          <span key={i} style={{
            fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:16, textTransform:'uppercase',
            letterSpacing:'0.08em', color:'var(--px-muted)', whiteSpace:'nowrap', padding:'0 24px',
            display:'flex', alignItems:'center', gap:24,
          }}>
            {t} <span style={{ color:'var(--px-red)' }}>+</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function Home() {
  const t = useTranslation();
  const h = t.home;

  const featureIcons = [
    <DeployIcon size={28} style={{ color: 'currentColor' }} />,
    <ShieldIcon size={28} style={{ color: 'currentColor' }} />,
    <GlobeIcon size={28} style={{ color: 'currentColor' }} />,
    <ChartIcon size={28} style={{ color: 'currentColor' }} />,
  ];
  const features = h.cards.map((card, i) => ({
    icon: featureIcons[i],
    tag: h.feature_tags[i],
    title: card.title,
    desc: card.desc,
    num: i + 1,
  }));

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'var(--px-bg)', overflowX:'hidden' }}>

      <div style={{ position:'relative', zIndex:2 }}>

        {/* ══ HERO ══ */}
        <section className="px-4 sm:px-6" style={{ padding:'88px 16px 0', position:'relative' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>

            <div className="fade-up" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <span style={{ width:10, height:10, background:'var(--px-red)', display:'inline-block' }} />
              <span className="swiss-index" style={{ fontSize: 13 }}>STARDEST // CLOUD PAAS</span>
            </div>

            {/* Main heading */}
            <h1 className="fade-up fade-up-1" style={{ margin:'0 0 32px', lineHeight:0.98, position:'relative' }}>
              <span style={{
                display:'block', fontFamily:"'Inter',sans-serif", fontWeight:900,
                fontSize:'clamp(40px, 10vw, 124px)',
                color:'var(--px-white)',
                letterSpacing:'-0.03em',
                textTransform:'uppercase',
              }}>
                {h.h1_1}
              </span>
              <span style={{
                display:'block', fontFamily:"'Inter',sans-serif", fontWeight:900,
                fontSize:'clamp(40px, 10vw, 124px)',
                color:'var(--px-red)',
                letterSpacing:'-0.03em',
                textTransform:'uppercase',
              }}>
                {h.h1_2}
              </span>
            </h1>

            <div className="fade-up fade-up-2" style={{ display:'flex', flexWrap:'wrap', gap:48, alignItems:'flex-end', justifyContent:'space-between', borderTop:'1px solid var(--px-border)', paddingTop:28, paddingBottom:48 }}>
              <p style={{
                fontFamily:"'Inter',sans-serif", fontSize:18, color:'var(--px-muted)',
                maxWidth:480, margin:0, lineHeight:1.6,
              }}>
                {h.subtitle}
              </p>

              {/* CTA buttons */}
              <div style={{ display:'flex', gap:0, flexWrap:'wrap' }}>
                <Link to="/deploy" className="px-btn" style={{
                  textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
                  fontSize:14, padding:'18px 36px',
                }}>
                  {h.cta_start}
                </Link>
                <a href="#como-funciona" className="px-btn-cyan px-border" style={{
                  textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
                  fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:14,
                  padding:'18px 36px', color:'var(--px-white)', borderLeft:'none',
                }}>
                  {h.cta_explore}
                </a>
              </div>
            </div>
          </div>
        </section>

        <Ticker text={h.h1_1 + ' ' + h.h1_2} />

        {/* ══ CÓMO FUNCIONA — Mission Control ══ */}
        <section id="como-funciona" style={{ padding:'clamp(56px, 10vw, 80px) 16px' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            {/* Section header */}
            <div className="fade-up" style={{ display:'flex', alignItems:'baseline', gap:16, marginBottom:48 }}>
              <span className="swiss-index">01</span>
              <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:900, fontSize:'clamp(28px, 5vw, 44px)', color: 'var(--px-white)', margin:0, textTransform:'uppercase', letterSpacing:'-0.01em' }}>{h.timeline_title}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-start">
              {/* Steps */}
              <div className="fade-up fade-up-1" style={{ display:'flex', flexDirection:'column' }}>
                <MissionStep num={1} icon={<CommitIcon size={20} style={{ color: 'var(--px-white)' }} />} title={h.timeline_steps[0].title} desc={h.timeline_steps[0].desc} active />
                <MissionStep num={2} icon={<BuildIcon size={20} style={{ color: 'var(--px-white)' }} />}  title={h.timeline_steps[1].title} desc={h.timeline_steps[1].desc} />
                <MissionStep num={3} icon={<GlobeIcon size={20} style={{ color: 'var(--px-white)' }} />}  title={h.timeline_steps[2].title} desc={h.timeline_steps[2].desc} />
                <div style={{ borderTop: '1px solid var(--px-border)' }} />
              </div>

              {/* Live terminal */}
              <div className="fade-up fade-up-2">
                <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:11, color:'var(--px-muted)', marginBottom:12, letterSpacing:'0.2em', textTransform:'uppercase' }}>
                  ● {h.live_simulation}
                </div>
                <LiveTerminal />
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES — Swiss Grid ══ */}
        <section id="features" style={{ padding:'clamp(56px, 10vw, 80px) 16px', borderTop:'1px solid var(--px-border)' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            <div className="fade-up" style={{ display:'flex', alignItems:'baseline', gap:16, marginBottom:48 }}>
              <span className="swiss-index">02</span>
              <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:900, fontSize:'clamp(28px, 5vw, 44px)', color: 'var(--px-white)', margin:0, textTransform:'uppercase', letterSpacing:'-0.01em' }}>{h.features_title}</h2>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))' }}>
              {features.map((f, i) => <FeatureCard key={f.title} {...f} className={`fade-up fade-up-${Math.min(i + 1, 4)}`} />)}
            </div>
          </div>
        </section>

        {/* ══ CTA FINAL ══ */}
        <section style={{ padding:0 }}>
          <div className="fade-up swiss-block-red px-6 py-16 sm:px-16 sm:py-24" style={{
            display:'flex', flexDirection:'column', alignItems:'flex-start', gap:28,
          }}>
            <h2 style={{ fontFamily:"'Inter',sans-serif", fontWeight:900, fontSize:'clamp(32px, 8vw, 80px)', color: '#ffffff', margin:0, textTransform:'uppercase', letterSpacing:'-0.02em', lineHeight:1.05, maxWidth:900 }}>{h.cta_title}</h2>
            <p style={{ fontFamily:"'Inter',sans-serif", fontSize:18, color:'rgba(255,255,255,0.85)', margin:0, lineHeight:1.6, maxWidth:560 }}>{h.cta_sub}</p>
            <Link to="/deploy" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:14, letterSpacing:'0.08em', textTransform:'uppercase',
              padding:'18px 40px', background:'#ffffff', color:'var(--px-red)', border:'1px solid #ffffff',
            }}>
              {h.cta_btn}
            </Link>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{ padding:'48px 24px 28px' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            {/* Logo */}
            <div style={{ marginBottom:40, display:'flex', alignItems:'center', gap:16 }}>
              <LogoMark size={24} style={{ color: 'var(--px-white)' }} />
              <span style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:18, color: 'var(--px-white)', textTransform:'uppercase', letterSpacing:'0.02em' }}>StarDest</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:'var(--px-red)', marginLeft:4 }}>// Cloud PaaS</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:36, marginBottom:40, borderTop:'1px solid var(--px-border)', paddingTop:36 }}>
              {h.footer.columns.map(({ title, links }) => (
                <div key={title}>
                  <h4 style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:12, color:'var(--px-white)', marginBottom:16, textTransform:'uppercase', letterSpacing:'0.1em' }}>{title}</h4>
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:10 }}>
                    {links.map(l => (
                      <li key={l}>
                        <a href="#" className="swiss-link" style={{ fontFamily:"'Inter',sans-serif", fontSize:14, color:'var(--px-muted)' }}
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
                <a href="#" className="swiss-link" style={{ color:'var(--px-muted)' }}>{h.footer.status}</a>
                <a href="#" className="swiss-link" style={{ color:'var(--px-muted)' }}>{h.footer.sla}</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
