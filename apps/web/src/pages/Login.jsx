import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { LogoMark } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';

function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
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
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-muted)' }}>
          <div style={{ animation: 'spin 1s linear infinite', width: 32, height: 32, border: '3px solid var(--px-border)', borderTopColor: 'var(--px-white)', borderRadius: '50%', margin: '0 auto 16px' }} />
          Cargando...
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--px-bg)' }}>

      {/* Card */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <LogoMark size={40} style={{ color: 'var(--px-white)' }} />
            <span style={{
              fontFamily: "'Inter',sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: 'var(--px-white)',
            }}>
              StarDest
            </span>
          </Link>
        </div>

        {/* Main panel */}
        <div className="px-card" style={{
          padding: '40px 36px',
        }}>

          {/* Heading */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <h1 style={{
              fontFamily: "'Inter',sans-serif",
              fontWeight: 800,
              fontSize: 26,
              color: 'var(--px-white)',
              margin: '0 0 6px',
            }}>
              {l.welcome || 'BIENVENIDO'}
            </h1>
            <p style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: 15,
              color: 'var(--px-muted)',
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
              border: '1px solid var(--px-border-glow)',
              background: 'var(--px-bg2)',
              color: 'var(--px-white)',
              fontFamily: "'Inter',sans-serif",
              fontSize: 14,
              textAlign: 'center',
              borderRadius: 8,
            }}>
              {l.error_login}
            </div>
          )}

          {/* Social login buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Google */}
            <a
              href="/api/auth/google"
              className="px-border"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '13px 20px',
                background: 'var(--px-bg)',
                color: 'var(--px-white)',
                textDecoration: 'none',
                fontFamily: "'Inter',sans-serif",
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 8,
                transition: 'border-color 0.15s, background 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--px-border-glow)';
                e.currentTarget.style.background = 'var(--px-bg2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--px-border)';
                e.currentTarget.style.background = 'var(--px-bg)';
              }}
            >
              <GoogleIcon />
              {l.google}
            </a>

            {/* GitHub */}
            <a
              href="/api/auth/github"
              className="px-border"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '13px 20px',
                background: 'var(--px-bg)',
                color: 'var(--px-white)',
                textDecoration: 'none',
                fontFamily: "'Inter',sans-serif",
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 8,
                transition: 'border-color 0.15s, background 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--px-border-glow)';
                e.currentTarget.style.background = 'var(--px-bg2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--px-border)';
                e.currentTarget.style.background = 'var(--px-bg)';
              }}
            >
              <GitHubIcon color="var(--px-white)" />
              {l.github}
            </a>
          </div>

          {/* Footer inside card */}
          <p style={{
            marginTop: 24,
            textAlign: 'center',
            fontFamily: "'Inter',sans-serif",
            fontSize: 13,
            color: 'var(--px-muted)',
          }}>
            {l.terms}
          </p>

        </div>

        {/* Back to home */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: "'Inter',sans-serif",
              fontSize: 14, color: 'var(--px-muted)', textDecoration: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--px-white)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--px-muted)'; }}
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
