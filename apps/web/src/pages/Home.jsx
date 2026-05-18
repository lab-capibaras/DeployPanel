import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { PixelRocket, PixelSatellite, PixelUFO, PixelGlobe, PixelShield, PixelMonitor } from '../components/PixelIcons';

/** Lightweight hook: re-renders when theme/lang changes */
function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
}

/* ─── Starfield Canvas ─── */
function PixelStarfield({ dark = true }) {
  const canvasRef = useRef(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Star colors per mode
    const darkColors  = ['#00d4ff','#9b59ff','#2d5fff','#e8eeff','#e8eeff'];
    const lightColors = ['#2d5fff','#1a3aaa','#4a7fff','#9b59ff','#0d1f6e'];

      const stars = Array.from({ length: 220 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1,
        speed: Math.random() * 0.25 + 0.03,
        twinkle: Math.random() * Math.PI * 2,
      }));
      const shoots = Array.from({ length: 2 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.4,
        vx: 5, vy: 3, life: 0, maxLife: 70, delay: Math.random() * 400 + 100,
      }));

      const draw = () => {
        const isDark = darkRef.current;
        const colors = isDark ? darkColors : lightColors;

        // Background trail
        ctx.fillStyle = isDark ? 'rgba(8,8,24,0.22)' : 'rgba(240,244,255,0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        stars.forEach((s, i) => {
          s.twinkle += 0.035;
          const alpha = 0.35 + 0.65 * Math.abs(Math.sin(s.twinkle));
          ctx.globalAlpha = isDark ? alpha : Math.min(1, alpha * 1.4);
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          if (s.size === 3) {
            ctx.globalAlpha *= 0.35;
            ctx.fillRect(Math.floor(s.x)-2, Math.floor(s.y)+1, 2, 1);
            ctx.fillRect(Math.floor(s.x)+3, Math.floor(s.y)+1, 2, 1);
            ctx.fillRect(Math.floor(s.x)+1, Math.floor(s.y)-2, 1, 2);
            ctx.fillRect(Math.floor(s.x)+1, Math.floor(s.y)+3, 1, 2);
          }
          s.y += s.speed;
          if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        });

      // Shooting stars
      shoots.forEach(sh => {
        sh.delay--;
        if (sh.delay > 0) return;
        sh.life++;
        if (sh.life > sh.maxLife) {
          sh.x = Math.random()*canvas.width; sh.y = Math.random()*canvas.height*0.3;
          sh.life = 0; sh.delay = Math.random()*300+150; return;
        }
        const isDark2 = darkRef.current;
        const p = sh.life / sh.maxLife;
        const trailColor = isDark2 ? '#00d4ff' : '#2d5fff';
        const headColor  = isDark2 ? '#ffffff' : '#1a3aaa';
        for (let i = 0; i < 18; i++) {
          ctx.globalAlpha = (i/18) * (p < 0.8 ? p/0.8 : (1-p)/0.2) * 0.9;
          ctx.fillStyle = trailColor;
          ctx.fillRect(Math.floor(sh.x - sh.vx*(i*0.5)), Math.floor(sh.y - sh.vy*(i*0.5)), 2, 1);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = headColor;
        ctx.fillRect(Math.floor(sh.x), Math.floor(sh.y), 3, 2);
        sh.x += sh.vx; sh.y += sh.vy;
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };

    // Fill once immediately so no flash
    ctx.fillStyle = darkRef.current ? '#080818' : '#f0f4ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []); // runs once; reads darkRef.current per frame

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, imageRendering:'pixelated' }} />;
}


/* ─── Mission step card ─── */
function MissionStep({ num, icon, title, desc, color='#2d5fff', active }) {
  return (
    <div style={{
      display:'flex', gap:20, alignItems:'flex-start',
      padding:'24px 28px',
      background: 'rgba(13,13,43,0.6)',
      border:`2px solid ${active ? color : 'var(--px-border)'}`,
      boxShadow: active ? `4px 4px 0 rgba(0,0,0,0.7), 0 0 20px ${color}44` : '3px 3px 0 rgba(0,0,0,0.6)',
      transition:'all 0.2s',
    }}>
      <div style={{
        flexShrink:0, width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center',
        border:`2px solid ${color}`, background:'#080818',
        boxShadow:`0 0 12px ${color}55`,
      }}>{icon}</div>
      <div>
        <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:11, color:'var(--px-muted)', marginBottom:4, letterSpacing:'0.1em' }}>PASO {num}</div>
        <h3 style={{ fontFamily:"'Jersey 10',monospace", fontSize:20, color:'#e8eeff', margin:'0 0 8px' }}>{title}</h3>
        <p style={{ fontFamily:"'Jersey 10',monospace", fontSize:17, color:'var(--px-muted)', margin:0, lineHeight:1.5 }}>{desc}</p>
      </div>
    </div>
  );
}

/* ─── Feature orbit card ─── */
function FeatureCard({ icon, title, desc, tag, glowColor='#2d5fff' }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding:'28px 24px',
        background: hov ? 'rgba(13,13,43,0.95)' : 'rgba(10,10,34,0.7)',
        border:`2px solid ${hov ? glowColor : 'var(--px-border)'}`,
        boxShadow: hov ? `5px 5px 0 rgba(0,0,0,0.7), 0 0 24px ${glowColor}44` : '3px 3px 0 rgba(0,0,0,0.6)',
        transform: hov ? 'translate(-2px,-2px)' : 'none',
        transition:'all 0.15s steps(2)',
        cursor:'default',
      }}
    >
      <div style={{ marginBottom:16, filter:`drop-shadow(0 0 8px ${glowColor})` }}>{icon}</div>
      <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:10, color:glowColor, marginBottom:8, letterSpacing:'0.12em' }}>{tag}</div>
      <h3 style={{ fontFamily:"'Jersey 10',monospace", fontSize:20, color:'#e8eeff', margin:'0 0 10px' }}>{title}</h3>
      <p style={{ fontFamily:"'Jersey 10',monospace", fontSize:17, color:'var(--px-muted)', margin:0, lineHeight:1.5 }}>{desc}</p>
    </div>
  );
}

/* ─── Live terminal ─── */
function LiveTerminal() {
  const lines = [
    { t:0,    c:'#6a7ab5', txt:'> stardest deploy main' },
    { t:800,  c:'#6a7ab5', txt:'  » Analizando repositorio...' },
    { t:1600, c:'#00ff88', txt:'  ✓ Repositorio autenticado' },
    { t:2400, c:'#6a7ab5', txt:'  » Construyendo contenedor...' },
    { t:3400, c:'#00ff88', txt:'  ✓ Imagen compilada [1.2s]' },
    { t:4200, c:'#6a7ab5', txt:'  » Provisionando red global...' },
    { t:5000, c:'#00ff88', txt:'  ✓ TLS aprovisionado' },
    { t:5800, c:'#00d4ff', txt:'  >> LIVE → prod-x4.stardest.com' },
  ];
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
    <div style={{
      background:'#020210', border:'2px solid var(--px-border)',
      boxShadow:'inset 0 0 30px rgba(0,0,20,0.9), 4px 4px 0 rgba(0,0,0,0.7)',
      padding:'20px 24px', fontFamily:"'Share Tech Mono',monospace",
      minHeight:220,
    }}>
      <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid var(--px-border)', paddingBottom:12 }}>
        {['#ff5f57','#febc2e','#28c840'].map(c=><div key={c} style={{width:10,height:10,background:c}}/>)}
        <span style={{ marginLeft:8, color:'var(--px-muted)', fontSize:12 }}>mission-control — deploy</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          color: l.c, fontSize:13, lineHeight:1.8, marginBottom:2,
          opacity: visible.includes(i) ? 1 : 0,
          transform: visible.includes(i) ? 'none' : 'translateX(-8px)',
          transition:'opacity 0.3s, transform 0.3s',
        }}>{l.txt}</div>
      ))}
      {visible.length === lines.length && (
        <span style={{ color:'#00d4ff', animation:'px-blink 1s steps(1) infinite' }}>█</span>
      )}
    </div>
  );
}

/* ─── Main ─── */
export default function Home() {
  const t = useTranslation();
  const h = t.home;
  const isDark = useTheme();

  const features = [
    { icon: <PixelRocket scale={1.2} />,    tag:'DESPLIEGUE', title:'Pipeline Inmutable', desc:'Cada commit genera un build sellado. Revierte en segundos con cero downtime.', glowColor:'#2d5fff' },
    { icon: <PixelShield scale={1.2} />,    tag:'SEGURIDAD',  title:'Red Blindada',       desc:'TLS automático, DDoS nativo y certificados renovados sin intervención.',     glowColor:'#9b59ff' },
    { icon: <PixelGlobe scale={1.2} />,     tag:'RED GLOBAL', title:'DNS Distribuido',    desc:'Borde distribuido que acerca el cómputo a tus usuarios finales.',            glowColor:'#00d4ff' },
    { icon: <PixelMonitor scale={1.2} />,   tag:'MONITOREO',  title:'Telemetría en Vivo', desc:'CPU, memoria y red en tiempo real. Sin configurar nada extra.',              glowColor:'#00ff88' },
  ];

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'transparent', overflowX:'hidden' }}>
      <PixelStarfield dark={isDark} />

      {/* Scanlines */}
      <div style={{ position:'fixed', inset:0, zIndex:1, pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,rgba(0,0,0,0.035) 0px,rgba(0,0,0,0.035) 1px,transparent 1px,transparent 3px)' }} />

      {/* Pixel grid */}
      <div style={{ position:'fixed', inset:0, zIndex:1, pointerEvents:'none',
        backgroundImage:'linear-gradient(rgba(30,45,122,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(30,45,122,0.05) 1px,transparent 1px)',
        backgroundSize:'32px 32px' }} />

      <div style={{ position:'relative', zIndex:2 }}>

        {/* ══ HERO ══ */}
        <section style={{ padding:'120px 24px 80px', textAlign:'center', position:'relative' }}>
          {/* Central glow */}
          <div style={{ position:'absolute', top:'40%', left:'50%', transform:'translate(-50%,-50%)',
            width:700, height:500, pointerEvents:'none',
            background:'radial-gradient(ellipse,rgba(45,95,255,0.15) 0%,transparent 70%)' }} />

          {/* Floating rocket — decorative */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:32, animation:'px-float 4s ease-in-out infinite' }}>
            <PixelRocket scale={3} />
          </div>

          {/* Status badge removed */}

          {/* Main heading */}
          <h1 style={{ margin:'0 0 24px', lineHeight:1.1 }}>
            <span style={{
              display:'block', fontFamily:"'Jersey 10',monospace",
              fontSize:'clamp(48px, 8vw, 96px)',
              color:'var(--px-white)',
              textShadow: isDark ? '0 0 40px rgba(232,238,255,0.2)' : 'none',
              marginBottom:8,
            }}>
              {h.h1_1}
            </span>
            <span style={{
              display:'block', fontFamily:"'Jersey 10',monospace",
              fontSize:'clamp(48px, 8vw, 96px)',
              background:'linear-gradient(90deg,#00d4ff,#2d5fff,#9b59ff)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
              filter:'drop-shadow(0 0 20px rgba(0,212,255,0.4))',
            }}>
              {h.h1_2}
            </span>
          </h1>

          <p style={{
            fontFamily:"'Jersey 10',monospace", fontSize:22, color:'var(--px-muted)',
            maxWidth:580, margin:'0 auto 48px', lineHeight:1.55,
          }}>
            {h.subtitle}
          </p>

          {/* CTA buttons */}
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap', marginBottom:80 }}>
            <Link to="/deploy" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:"'Jersey 10',monospace", fontSize:18,
              padding:'14px 32px', color:'#e8eeff',
              background:'linear-gradient(135deg,#0f1f5c,#1a3aff)',
              border:'2px solid #2d5fff',
              boxShadow:'5px 5px 0 rgba(0,0,0,0.6), 0 0 20px rgba(45,95,255,0.4)',
            }}>
              {h.cta_start}
            </Link>
            <a href="#como-funciona" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:"'Jersey 10',monospace", fontSize:18,
              padding:'14px 32px', color:'#00d4ff',
              background:'transparent',
              border:'2px solid rgba(0,212,255,0.5)',
              boxShadow:'5px 5px 0 rgba(0,0,0,0.6)',
            }}>
              ◉ {h.cta_explore}
            </a>
          </div>

          {/* Metrics row */}
          <div style={{
            display:'inline-grid', gridTemplateColumns:'repeat(4,1fr)',
            gap:0, border:'2px solid var(--px-border)',
            boxShadow:'4px 4px 0 rgba(0,0,0,0.6)',
            background:'rgba(13,13,43,0.7)', maxWidth:700, width:'100%',
          }}>
            {h.metrics.map(({ val, label }, i) => (
              <div key={label} style={{
                padding:'20px 16px', textAlign:'center',
                borderRight: i < 3 ? '1px solid var(--px-border)' : 'none',
              }}>
                <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:26, color:'#00d4ff', marginBottom:6,
                  textShadow:'0 0 12px rgba(0,212,255,0.5)' }}>{val}</div>
                <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:11, color:'var(--px-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ CÓMO FUNCIONA — Mission Control ══ */}
        <section id="como-funciona" style={{ padding:'80px 24px', background: isDark ? 'rgba(8,8,20,0.6)' : 'rgba(200,215,255,0.5)' }}>
          <div style={{ maxWidth:900, margin:'0 auto' }}>
            {/* Section header */}
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:48 }}>
              <div style={{ flex:1, height:2, background:'linear-gradient(90deg,transparent,var(--px-border))' }} />
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:11, color:'#9b59ff', letterSpacing:'0.15em', marginBottom:8 }}>MISIÓN DE CONTROL</div>
                <h2 style={{ fontFamily:"'Jersey 10',monospace", fontSize:32, color:'#e8eeff', margin:0 }}>{h.timeline_title}</h2>
              </div>
              <div style={{ flex:1, height:2, background:'linear-gradient(90deg,var(--px-border),transparent)' }} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, alignItems:'center' }}>
              {/* Steps */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <MissionStep num={1} icon={<PixelSatellite scale={1} />} title={h.timeline_steps[0].title} desc={h.timeline_steps[0].desc} color="#2d5fff" active />
                <MissionStep num={2} icon={<PixelUFO scale={1} />}       title={h.timeline_steps[1].title} desc={h.timeline_steps[1].desc} color="#9b59ff" />
                <MissionStep num={3} icon={<PixelGlobe scale={1} />}     title={h.timeline_steps[2].title} desc={h.timeline_steps[2].desc} color="#00d4ff" />
              </div>

              {/* Live terminal */}
              <div>
                <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:11, color:'#00d4ff', marginBottom:12, letterSpacing:'0.1em' }}>
                  ● SIMULACIÓN EN VIVO
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
              <div style={{ flex:1, height:2, background:'linear-gradient(90deg,transparent,var(--px-border))' }} />
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Jersey 10',monospace", fontSize:11, color:'#00d4ff', letterSpacing:'0.15em', marginBottom:8 }}>SISTEMAS DE LA NAVE</div>
                <h2 style={{ fontFamily:"'Jersey 10',monospace", fontSize:32, color:'#e8eeff', margin:0 }}>{h.features_title}</h2>
              </div>
              <div style={{ flex:1, height:2, background:'linear-gradient(90deg,var(--px-border),transparent)' }} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
              {features.map(f => <FeatureCard key={f.title} {...f} />)}
            </div>
          </div>
        </section>

        {/* ══ CTA FINAL ══ */}
        <section style={{ padding:'80px 24px 100px' }}>
          <div style={{
            maxWidth:760, margin:'0 auto', textAlign:'center',
            padding:'60px 40px',
            background:'rgba(13,13,43,0.8)',
            border:'2px solid var(--px-border-glow)',
            boxShadow:'8px 8px 0 rgba(0,0,0,0.6), 0 0 40px rgba(45,95,255,0.25)',
          }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:20, filter:'drop-shadow(0 0 20px #2d5fff)' }}>
              <PixelRocket scale={4} />
            </div>
            <h2 style={{ fontFamily:"'Jersey 10',monospace", fontSize:34, color:'#e8eeff', margin:'0 0 16px' }}>{h.cta_title}</h2>
            <p style={{ fontFamily:"'Jersey 10',monospace", fontSize:20, color:'var(--px-muted)', margin:'0 0 36px', lineHeight:1.5 }}>{h.cta_sub}</p>
            <Link to="/deploy" style={{
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:"'Jersey 10',monospace", fontSize:18, color:'#080818',
              padding:'16px 40px', background:'#00d4ff',
              border:'2px solid #00d4ff',
              boxShadow:'5px 5px 0 rgba(0,0,0,0.6)',
            }}>
              {h.cta_btn}
            </Link>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{ borderTop:'1px solid var(--px-border)', background: isDark ? '#040812' : '#dde6ff', padding:'48px 24px 28px' }}>
          <div style={{ maxWidth:1000, margin:'0 auto' }}>
            {/* Logo */}
            <div style={{ marginBottom:40, display:'flex', alignItems:'center', gap:16 }}>
              <PixelRocket scale={1.2} />
              <span style={{ fontFamily:"'Jersey 10',monospace", fontSize:20, color:'#e8eeff', textShadow:'0 0 10px rgba(0,212,255,0.5)' }}>StarDest</span>
              <span style={{ fontFamily:"'Jersey 10',monospace", fontSize:12, color:'var(--px-muted)', marginLeft:4 }}>// Cloud PaaS</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:36, marginBottom:40 }}>
              {h.footer.columns.map(({ title, links }) => (
                <div key={title}>
                  <h4 style={{ fontFamily:"'Jersey 10',monospace", fontSize:12, color:'#9b59ff', marginBottom:16, textTransform:'uppercase', letterSpacing:'0.1em' }}>{title}</h4>
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:10 }}>
                    {links.map(l => (
                      <li key={l}>
                        <a href="#" style={{ fontFamily:"'Jersey 10',monospace", fontSize:16, color:'var(--px-muted)', textDecoration:'none' }}
                          onMouseEnter={e => e.target.style.color='#00d4ff'}
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
              fontFamily:"'Jersey 10',monospace", fontSize:14, color:'var(--px-muted)' }}>
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
