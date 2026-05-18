import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { PixelRocket } from '../components/PixelIcons';

function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
}

/* ─── Starfield Canvas (same as Home) ─── */
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

    const darkColors  = ['#00d4ff', '#9b59ff', '#2d5fff', '#e8eeff', '#e8eeff'];
    const lightColors = ['#2d5fff', '#1a3aaa', '#4a7fff', '#9b59ff', '#0d1f6e'];

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
          ctx.fillRect(Math.floor(s.x) - 2, Math.floor(s.y) + 1, 2, 1);
          ctx.fillRect(Math.floor(s.x) + 3, Math.floor(s.y) + 1, 2, 1);
          ctx.fillRect(Math.floor(s.x) + 1, Math.floor(s.y) - 2, 1, 2);
          ctx.fillRect(Math.floor(s.x) + 1, Math.floor(s.y) + 3, 1, 2);
        }
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
      });

      shoots.forEach(sh => {
        sh.delay--;
        if (sh.delay > 0) return;
        sh.life++;
        if (sh.life > sh.maxLife) {
          sh.x = Math.random() * canvas.width; sh.y = Math.random() * canvas.height * 0.3;
          sh.life = 0; sh.delay = Math.random() * 300 + 150; return;
        }
        const isDark2 = darkRef.current;
        const p = sh.life / sh.maxLife;
        const trailColor = isDark2 ? '#00d4ff' : '#2d5fff';
        const headColor  = isDark2 ? '#ffffff' : '#1a3aaa';
        for (let i = 0; i < 18; i++) {
          ctx.globalAlpha = (i / 18) * (p < 0.8 ? p / 0.8 : (1 - p) / 0.2) * 0.9;
          ctx.fillStyle = trailColor;
          ctx.fillRect(Math.floor(sh.x - sh.vx * (i * 0.5)), Math.floor(sh.y - sh.vy * (i * 0.5)), 2, 1);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = headColor;
        ctx.fillRect(Math.floor(sh.x), Math.floor(sh.y), 3, 2);
        sh.x += sh.vx; sh.y += sh.vy;
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };

    ctx.fillStyle = darkRef.current ? '#080818' : '#f0f4ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, imageRendering: 'pixelated' }} />;
}

/* ─── Pixel input component ─── */
function PixelInput({ id, type, label, placeholder, value, onChange, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontFamily: "'Jersey 10',monospace",
          fontSize: 14,
          color: '#8ab0ff',
          marginBottom: 8,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: '#020210',
          border: `2px solid ${focused ? '#2d5fff' : '#1e2d7a'}`,
          color: '#e8eeff',
          fontFamily: "'Share Tech Mono',monospace",
          fontSize: 15,
          outline: 'none',
          boxShadow: focused ? '0 0 0 1px #2d5fff, inset 0 0 12px rgba(45,95,255,0.08)' : 'inset 0 0 8px rgba(0,0,0,0.4)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/* ─── Pixel button ─── */
function PixelButton({ children, type = 'button', disabled, onClick, variant = 'primary' }) {
  const [hov, setHov] = useState(false);
  const primary = variant === 'primary';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        padding: '14px 24px',
        background: primary
          ? (hov ? 'linear-gradient(135deg,#1a3aff,#0f1f5c)' : 'linear-gradient(135deg,#0f1f5c,#1a3aff)')
          : 'transparent',
        border: `2px solid ${primary ? '#2d5fff' : '#1e2d7a'}`,
        color: primary ? '#e8eeff' : '#8ab0ff',
        fontFamily: "'Jersey 10',monospace",
        fontSize: 18,
        letterSpacing: '0.08em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: hov && !disabled
          ? `4px 4px 0 rgba(0,0,0,0.7), 0 0 20px rgba(45,95,255,0.4)`
          : `3px 3px 0 rgba(0,0,0,0.6)`,
        transform: hov && !disabled ? 'translate(-1px,-1px)' : 'none',
        transition: 'all 0.1s steps(2)',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

function Login() {
  const t = useTranslation();
  const l = t.login;
  const isDark = useTheme();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <PixelStarfield dark={isDark} />

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.035) 0px,rgba(0,0,0,0.035) 1px,transparent 1px,transparent 3px)',
      }} />

      {/* Pixel grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(30,45,122,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(30,45,122,0.05) 1px,transparent 1px)',
        backgroundSize: '32px 32px',
      }} />

      {/* Central glow */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, pointerEvents: 'none', zIndex: 1,
        background: 'radial-gradient(ellipse,rgba(45,95,255,0.12) 0%,transparent 70%)',
      }} />

      {/* Card */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{ animation: 'px-float 4s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(45,95,255,0.7))' }}>
              <PixelRocket scale={2} />
            </div>
            <span style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 28,
              color: '#e8eeff',
              textShadow: '0 0 20px rgba(0,212,255,0.4)',
              letterSpacing: '0.05em',
            }}>
              StarDest
            </span>
          </Link>
        </div>

        {/* Main panel */}
        <div style={{
          background: 'rgba(2,2,16,0.85)',
          border: '2px solid #1e2d7a',
          boxShadow: '6px 6px 0 rgba(0,0,0,0.7), 0 0 40px rgba(45,95,255,0.15)',
          padding: '40px 36px',
        }}>

          {/* Panel header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 28, borderBottom: '1px solid #1e2d7a', paddingBottom: 16,
          }}>
            {['#ff5f57', '#febc2e', '#28c840'].map(c => (
              <div key={c} style={{ width: 9, height: 9, background: c }} />
            ))}
            <span style={{
              marginLeft: 8, fontFamily: "'Share Tech Mono',monospace",
              fontSize: 12, color: '#4a6a9a', letterSpacing: '0.05em',
            }}>
              auth — secure-login
            </span>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 28,
              color: '#e8eeff',
              margin: '0 0 6px',
              letterSpacing: '0.04em',
            }}>
              {l.welcome}
            </h1>
            <p style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 16,
              color: '#4a6a9a',
              margin: 0,
            }}>
              {l.subtitle}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <PixelInput
              id="email"
              type="email"
              label={l.email_label}
              placeholder={l.email_ph}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label
                  htmlFor="password"
                  style={{
                    fontFamily: "'Jersey 10',monospace",
                    fontSize: 14,
                    color: '#8ab0ff',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {l.password_label}
                </label>
                <a
                  href="#"
                  style={{
                    fontFamily: "'Jersey 10',monospace",
                    fontSize: 13,
                    color: '#2d5fff',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => e.target.style.color = '#00d4ff'}
                  onMouseLeave={e => e.target.style.color = '#2d5fff'}
                >
                  {l.forgot}
                </a>
              </div>
              <PixelInput
                id="password"
                type="password"
                label=""
                placeholder={l.password_ph}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            {/* Remember me */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, marginTop: -8 }}>
              <input
                id="remember"
                type="checkbox"
                style={{
                  width: 14, height: 14,
                  accentColor: '#2d5fff',
                  cursor: 'pointer',
                }}
              />
              <label
                htmlFor="remember"
                style={{
                  marginLeft: 8,
                  fontFamily: "'Jersey 10',monospace",
                  fontSize: 14,
                  color: '#4a6a9a',
                  cursor: 'pointer',
                }}
              >
                {l.remember}
              </label>
            </div>

            {/* Submit */}
            <PixelButton type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {l.submitting}
                </>
              ) : `▶ ${l.submit}`}
            </PixelButton>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#1e2d7a' }} />
            <span style={{ fontFamily: "'Jersey 10',monospace", fontSize: 13, color: '#4a6a9a' }}>
              {l.or_continue}
            </span>
            <div style={{ flex: 1, height: 1, background: '#1e2d7a' }} />
          </div>

          {/* Social Login */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              {
                label: 'GitHub',
                icon: (
                  <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                ),
              },
              {
                label: 'Google',
                icon: (
                  <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                ),
              },
            ].map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: '2px solid #1e2d7a',
                  color: '#8ab0ff',
                  fontFamily: "'Jersey 10',monospace",
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 rgba(0,0,0,0.5)',
                  transition: 'all 0.1s steps(2)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#2d5fff';
                  e.currentTarget.style.color = '#e8eeff';
                  e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#1e2d7a';
                  e.currentTarget.style.color = '#8ab0ff';
                  e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.5)';
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sign up link */}
        <p style={{
          textAlign: 'center', marginTop: 20,
          fontFamily: "'Jersey 10',monospace",
          fontSize: 15, color: '#4a6a9a',
        }}>
          {l.no_account}{' '}
          <a
            href="#"
            style={{ color: '#2d5fff', textDecoration: 'none', fontWeight: 'bold' }}
            onMouseEnter={e => e.target.style.color = '#00d4ff'}
            onMouseLeave={e => e.target.style.color = '#2d5fff'}
          >
            {l.sign_up}
          </a>
        </p>

        {/* Back to home */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: "'Jersey 10',monospace",
              fontSize: 14, color: '#4a6a9a', textDecoration: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e8eeff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a6a9a'; }}
          >
            ← {l.back_home}
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default Login;
