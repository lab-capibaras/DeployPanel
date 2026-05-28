import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { PixelRocket } from '../components/PixelIcons';
import { useAuth } from '../hooks/useAuth';

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
        const alpha = 0.35 + 0.65 * Math.abs(s.twinkle);
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

function Login() {
  const t = useTranslation();
  const l = t.login;
  const isDark = useTheme();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <PixelStarfield dark={isDark} />
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', fontFamily: "'Jersey 10',monospace", fontSize: 24, color: isDark ? '#e8eeff' : '#0d1433' }}>
          <div style={{ animation: 'spin 1s linear infinite', width: 32, height: 32, border: '4px solid rgba(45,95,255,0.3)', borderTopColor: '#2d5fff', borderRadius: '50%', margin: '0 auto 16px' }} />
          Cargando...
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const cardBg = isDark ? 'rgba(2,2,16,0.85)' : 'rgba(255,255,255,0.9)';
  const cardBorder = isDark ? '#1e2d7a' : '#c3d3e5';
  const textTitle = isDark ? '#e8eeff' : '#0d1433';
  const textMuted = isDark ? '#4a6a9a' : '#6b7280';
  const btnBorder = isDark ? '#1e2d7a' : '#c3d3e5';
  const btnBg = isDark ? 'rgba(15,44,69,0.3)' : 'rgba(45,95,255,0.05)';
  const btnColor = isDark ? '#e8eeff' : '#0d1433';

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <PixelStarfield dark={isDark} />

      {/* Scanlines */}
      {isDark && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.035) 0px,rgba(0,0,0,0.035) 1px,transparent 1px,transparent 3px)',
        }} />
      )}

      {/* Central glow */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, pointerEvents: 'none', zIndex: 1,
        background: isDark ? 'radial-gradient(ellipse,rgba(45,95,255,0.12) 0%,transparent 70%)' : 'radial-gradient(ellipse,rgba(45,95,255,0.06) 0%,transparent 70%)',
      }} />

      {/* Card */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{ animation: 'px-float 4s ease-in-out infinite', filter: isDark ? 'drop-shadow(0 0 12px rgba(45,95,255,0.7))' : 'none' }}>
              <PixelRocket scale={2} />
            </div>
            <span style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 28,
              color: textTitle,
              textShadow: isDark ? '0 0 20px rgba(0,212,255,0.4)' : 'none',
              letterSpacing: '0.05em',
            }}>
              StarDest
            </span>
          </Link>
        </div>

        {/* Main panel */}
        <div style={{
          background: cardBg,
          border: `2px solid ${cardBorder}`,
          boxShadow: isDark ? '6px 6px 0 rgba(0,0,0,0.7), 0 0 40px rgba(45,95,255,0.15)' : '6px 6px 0 rgba(45,95,255,0.1), 0 0 20px rgba(45,95,255,0.05)',
          padding: '40px 36px',
        }}>

          {/* Panel header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 28, borderBottom: `1px solid ${cardBorder}`, paddingBottom: 16,
          }}>
            {['#ff5f57', '#febc2e', '#28c840'].map(c => (
              <div key={c} style={{ width: 9, height: 9, background: c }} />
            ))}
            <span style={{
              marginLeft: 8, fontFamily: "'Share Tech Mono',monospace",
              fontSize: 12, color: textMuted, letterSpacing: '0.05em',
            }}>
              auth — secure-login
            </span>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <h1 style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 28,
              color: textTitle,
              margin: '0 0 6px',
              letterSpacing: '0.04em',
            }}>
              {l.welcome || 'BIENVENIDO'}
            </h1>
            <p style={{
              fontFamily: "'Jersey 10',monospace",
              fontSize: 16,
              color: textMuted,
              margin: 0,
            }}>
              {l.subtitle || 'Inicia sesión para continuar'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 20,
              padding: '12px 16px',
              border: '2px solid #ef4444',
              background: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
              color: isDark ? '#fca5a5' : '#b91c1c',
              fontFamily: "'Jersey 10',monospace",
              fontSize: 15,
              textAlign: 'center',
              boxShadow: '3px 3px 0 rgba(239,68,68,0.15)',
            }}>
              Error al iniciar sesión. Intenta de nuevo.
            </div>
          )}

          {/* Social login buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Google */}
            <a
              href="/api/auth/google"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '14px 20px',
                border: `2px solid ${btnBorder}`,
                background: btnBg,
                color: btnColor,
                textDecoration: 'none',
                fontFamily: "'Jersey 10',monospace",
                fontSize: 18,
                letterSpacing: '0.04em',
                transition: 'all 0.1s steps(2)',
                cursor: 'pointer',
                boxShadow: isDark ? '3px 3px 0 rgba(0,0,0,0.5)' : '3px 3px 0 rgba(45,95,255,0.08)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#2d5fff';
                e.currentTarget.style.background = isDark ? 'rgba(0,212,255,0.06)' : 'rgba(45,95,255,0.08)';
                e.currentTarget.style.boxShadow = isDark
                  ? '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)'
                  : '4px 4px 0 rgba(45,95,255,0.15), 0 0 12px rgba(45,95,255,0.1)';
                e.currentTarget.style.transform = 'translate(-1px,-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = btnBorder;
                e.currentTarget.style.background = btnBg;
                e.currentTarget.style.boxShadow = isDark ? '3px 3px 0 rgba(0,0,0,0.5)' : '3px 3px 0 rgba(45,95,255,0.08)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <GoogleIcon />
              Continuar con Google
            </a>

            {/* GitHub */}
            <a
              href="/api/auth/github"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '14px 20px',
                border: `2px solid ${btnBorder}`,
                background: btnBg,
                color: btnColor,
                textDecoration: 'none',
                fontFamily: "'Jersey 10',monospace",
                fontSize: 18,
                letterSpacing: '0.04em',
                transition: 'all 0.1s steps(2)',
                cursor: 'pointer',
                boxShadow: isDark ? '3px 3px 0 rgba(0,0,0,0.5)' : '3px 3px 0 rgba(45,95,255,0.08)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#2d5fff';
                e.currentTarget.style.background = isDark ? 'rgba(0,212,255,0.06)' : 'rgba(45,95,255,0.08)';
                e.currentTarget.style.boxShadow = isDark
                  ? '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)'
                  : '4px 4px 0 rgba(45,95,255,0.15), 0 0 12px rgba(45,95,255,0.1)';
                e.currentTarget.style.transform = 'translate(-1px,-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = btnBorder;
                e.currentTarget.style.background = btnBg;
                e.currentTarget.style.boxShadow = isDark ? '3px 3px 0 rgba(0,0,0,0.5)' : '3px 3px 0 rgba(45,95,255,0.08)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <GitHubIcon color={btnColor} />
              Continuar con GitHub
            </a>
          </div>

          {/* Footer inside card */}
          <p style={{
            marginTop: 24,
            textAlign: 'center',
            fontFamily: "'Jersey 10',monospace",
            fontSize: 13,
            color: textMuted,
          }}>
            Al continuar aceptas los términos de uso
          </p>

        </div>

        {/* Back to home */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: "'Jersey 10',monospace",
              fontSize: 15, color: textMuted, textDecoration: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = textTitle; }}
            onMouseLeave={e => { e.currentTarget.style.color = textMuted; }}
          >
            ← {l.back_home || 'Volver al inicio'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}

export default Login;
