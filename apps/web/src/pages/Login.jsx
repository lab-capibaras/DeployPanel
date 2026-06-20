import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';

function Login() {
  const t = useTranslation();
  const l = t.login;
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, margin: '0 auto 16px',
            border: '2px solid var(--px-border)', borderTopColor: 'var(--px-red)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--px-muted)', margin: 0 }}>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', background: 'var(--px-bg)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 65%)',
      }} />

      <div className="fade-up" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, background: 'var(--px-white)', display: 'inline-block' }} />
            <span style={{
              fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18,
              color: 'var(--px-white)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>StarDest</span>
          </Link>
        </div>

        {/* Panel */}
        <div style={{
          padding: '40px 36px',
          background: 'var(--px-surface)',
          border: '1px solid var(--px-border)',
          borderRadius: 'var(--px-radius-lg)',
          boxShadow: 'var(--px-shadow-md)',
        }}>

          {/* Heading */}
          <div style={{ marginBottom: 32, textAlign: 'center' }}>
            <h1 style={{
              fontFamily: "'Inter',sans-serif", fontWeight: 900,
              fontSize: 'clamp(26px, 5vw, 34px)', color: 'var(--px-white)',
              margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.1,
            }}>{l.welcome || 'Bienvenido'}</h1>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, color: 'var(--px-muted)', margin: 0 }}>
              {l.subtitle || 'Inicia sesión para continuar'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 24, padding: '12px 16px',
              background: 'rgba(255,43,0,0.08)',
              border: '1px solid rgba(255,43,0,0.3)',
              borderRadius: 'var(--px-radius-sm)',
              color: 'var(--px-white)',
              fontFamily: "'Inter',sans-serif", fontSize: 14,
            }}>
              {l.error_login}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <OAuthButton href="/api/auth/google" icon={<GoogleIcon />} label={l.google} />
            <OAuthButton href="/api/auth/github" icon={<GitHubIcon />} label={l.github} />
          </div>

          <p style={{
            marginTop: 24, fontFamily: "'Inter',sans-serif", fontSize: 12,
            color: 'var(--px-muted)', textAlign: 'center', lineHeight: 1.6,
          }}>{l.terms}</p>
        </div>

        {/* Back link */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/" className="swiss-link" style={{
            fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13,
            color: 'var(--px-muted)', letterSpacing: '0.02em',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--px-white)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--px-muted)'}
          >
            ← {l.back_home || 'Volver al inicio'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function OAuthButton({ href, icon, label }) {
  const [hov, setHov] = React.useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 18px',
        background: hov ? 'var(--px-bg)' : 'transparent',
        border: `1px solid ${hov ? 'var(--px-border-glow)' : 'var(--px-border)'}`,
        borderRadius: 'var(--px-radius-sm)',
        color: hov ? 'var(--px-white)' : 'var(--px-muted)',
        textDecoration: 'none',
        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 15,
        cursor: 'pointer', transition: 'all 0.18s ease',
        boxShadow: hov ? 'var(--px-shadow-sm)' : 'none',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, opacity: hov ? 1 : 0, transition: 'opacity 0.18s ease' }}>→</span>
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}

export default Login;
