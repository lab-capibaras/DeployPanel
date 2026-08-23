import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Deploy from './pages/Deploy';
import Dashboard from './pages/Dashboard';
import { useAuth } from './hooks/useAuth';

import { setTheme as storeSetTheme, setLang as storeSetLang, getPrefs, subscribePrefs } from './store/prefs';
import { useTranslation } from './i18n';

/** Hook — only components calling this will re-render on prefs change */
function usePrefs() {
  const [prefs, setPrefs] = useState(() => getPrefs());
  useEffect(() => {
    return subscribePrefs((p) => setPrefs(p));
  }, []);
  return { ...prefs, setTheme: storeSetTheme, setLang: storeSetLang };
}

/* ═══════════════════════════════════════════════════════════
   NAV DATA (static — not dependent on React lang state)
═══════════════════════════════════════════════════════════ */
const NAV_TOOLS = {
  es: [
    { to: '/deploy', label: 'Despliegue', desc: 'Despliega tu código en segundos',   icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /> },
    { to: '#', label: 'Pizarra',    desc: 'Diseña tu arquitectura visualmente',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    { to: '#', label: 'Monitoreo',  desc: 'Métricas de CPU en tiempo real',           icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
    { to: '#', label: 'Dominios',   desc: 'Configura URLs y certificados',             icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /> },
  ],
  en: [
    { to: '/deploy', label: 'Deploy',     desc: 'Ship your code in seconds',          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /> },
    { to: '#', label: 'Board',       desc: 'Design your architecture visually',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    { to: '#', label: 'Monitoring',  desc: 'Real-time CPU metrics',                   icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
    { to: '#', label: 'Domains',     desc: 'Set up URLs and certificates',            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /> },
  ],
};

/* ─────────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────────── */
const ContrastIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />
  </svg>
);

const SunIcon = ({ size = 15, animStyle }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={animStyle}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1"  x2="12" y2="3"  />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"  />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1"  y1="12" x2="3"  y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
  </svg>
);

const MoonIcon = ({ size = 15, animStyle }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={animStyle}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const HomeNavIcon   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const DeployNavIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
const GridNavIcon   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
const PersonNavIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

function BottomNavItem({ to, icon, label, active, isDark, onClick }) {
  const main  = isDark ? '#fafafa' : '#09090b';
  const muted = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)';
  const s = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 3, padding: '8px 4px', border: 'none', flex: 1,
    background: 'transparent', position: 'relative',
    color: active ? main : muted, cursor: 'pointer',
    transition: 'color 0.2s',
    textDecoration: 'none', outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };
  const inner = (
    <>
      <span style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: active ? 20 : 0, height: 2, borderRadius: 999,
        background: active ? main : 'transparent',
        transition: 'width 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
      {icon}
      {label && <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1 }}>{label}</span>}
    </>
  );
  if (onClick) return <button onClick={onClick} style={s}>{inner}</button>;
  return <Link to={to} style={s}>{inner}</Link>;
}

function MobileBottomNav() {
  const { theme, lang } = usePrefs();
  const { user, loading, logout } = useAuth();
  const isDark = theme === 'dark';
  const loc = useLocation();
  const [showPrefs, setShowPrefs]   = useState(false);
  const [showUser, setShowUser]     = useState(false);
  const wrapRef = useRef(null);

  const closeAll = () => { setShowPrefs(false); setShowUser(false); };

  useEffect(() => {
    const anyOpen = showPrefs || showUser;
    if (!anyOpen) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) closeAll(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h, { passive: true });
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [showPrefs, showUser]);

  useEffect(() => { closeAll(); }, [loc.pathname]);

  const bg     = isDark ? 'rgba(10,10,10,0.65)' : 'rgba(255,255,255,0.65)';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const shadow = isDark ? '0 8px 32px rgba(0,0,0,0.55)' : '0 8px 32px rgba(0,0,0,0.1)';
  const main   = isDark ? '#fafafa' : '#09090b';
  const muted  = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
  const isEs   = lang === 'es';

  if (loading) return null;

  const popupStyle = {
    position: 'absolute', bottom: 'calc(100% + 10px)',
    background: bg, border: `1px solid ${border}`, borderRadius: 14,
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    boxShadow: shadow, overflow: 'hidden',
  };

  return (
    <div ref={wrapRef} className="fixed md:hidden z-50" style={{ bottom: 14, left: 14, right: 14 }}>

      {/* Prefs popup */}
      {showPrefs && (
        <div style={{ ...popupStyle, right: 0 }}>
          <PreferencesPanel />
        </div>
      )}

      {/* User popup */}
      {showUser && user && (
        <div style={{ ...popupStyle, right: 0, minWidth: 200 }}>
          {/* User info header */}
          <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {user.avatar
                ? <img src={user.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: main, color: isDark ? '#09090b' : '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', flexShrink: 0 }}>{user.name?.charAt(0).toUpperCase()}</div>
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: main, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                {user.email && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <Link to="/dashboard" onClick={closeAll} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
            textDecoration: 'none', color: main,
            fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500,
            borderBottom: `1px solid ${border}`,
          }}
            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <GridNavIcon />
            Dashboard
          </Link>

          <button onClick={() => { closeAll(); logout(); }} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--px-red)',
            fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,43,0,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {isEs ? 'Cerrar sesión' : 'Log out'}
          </button>
        </div>
      )}

      <nav style={{
        background: bg, border: `1px solid ${border}`, borderRadius: 20,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        boxShadow: shadow, display: 'flex', alignItems: 'stretch', padding: '4px 6px',
      }}>
        <BottomNavItem to="/" icon={<HomeNavIcon />} label={isEs ? 'Inicio' : 'Home'} active={loc.pathname === '/'} isDark={isDark} />
        <BottomNavItem to="/deploy" icon={<DeployNavIcon />} label="Deploy" active={loc.pathname === '/deploy'} isDark={isDark} />
        {user && <BottomNavItem to="/dashboard" icon={<GridNavIcon />} label="Dashboard" active={loc.pathname === '/dashboard'} isDark={isDark} />}
        <BottomNavItem
          icon={<ContrastIcon size={20} />} label={isEs ? 'Tema' : 'Theme'}
          active={showPrefs} isDark={isDark}
          onClick={() => { setShowUser(false); setShowPrefs(o => !o); }}
        />
        {user ? (
          <BottomNavItem
            active={showUser} isDark={isDark}
            label={(user.name?.split(' ')[0] || '').slice(0, 8)}
            onClick={() => { setShowPrefs(false); setShowUser(o => !o); }}
            icon={user.avatar
              ? <img src={user.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', border: showUser ? `1.5px solid ${main}` : '1.5px solid transparent', transition: 'border-color 0.15s' }} />
              : <div style={{ width: 22, height: 22, borderRadius: '50%', background: isDark ? '#fafafa' : '#09090b', color: isDark ? '#09090b' : '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>{user.name?.charAt(0).toUpperCase()}</div>
            }
          />
        ) : (
          <BottomNavItem to="/login" icon={<PersonNavIcon />} label={isEs ? 'Entrar' : 'Login'} active={loc.pathname === '/login'} isDark={isDark} />
        )}
      </nav>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PREFERENCES PANEL (only this component re-renders on prefs change)
═══════════════════════════════════════════════════════════ */
function PreferencesPanel({ inline = false }) {
  const { theme, lang, setTheme, setLang } = usePrefs();
  const t = useTranslation();
  const isDark = theme === 'dark';

  const handleTheme = (newTheme) => {
    if (newTheme === theme) return;
    if (document.startViewTransition) {
      document.startViewTransition(() => setTheme(newTheme));
    } else {
      document.documentElement.classList.add('theme-transitioning');
      setTheme(newTheme);
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500);
    }
  };

  // Icon animation: active → normal, inactive → rotated+faded
  const iconAnim = (active) => ({
    transition: 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
    transform:  active ? 'rotate(0deg) scale(1)'    : 'rotate(-80deg) scale(0.65)',
    opacity:    active ? 1 : 0.3,
    flexShrink: 0,
  });

  const pillBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    flex: 1, padding: '6px 10px',
    borderRadius: 0, border: '1px solid transparent',
    cursor: 'pointer', fontWeight: 700, fontSize: '12px',
    letterSpacing: '0.04em', lineHeight: 1,
    transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
    outline: 'none', whiteSpace: 'nowrap',
  };
  const pillOn = isDark
    ? { background: '#fafafa', borderColor: '#fafafa', color: '#09090b' }
    : { background: '#09090b', borderColor: '#09090b', color: '#ffffff' };

  const pillOff = isDark
    ? { background: 'transparent', borderColor: 'transparent', color: 'rgba(255,255,255,0.4)' }
    : { background: 'transparent', borderColor: 'transparent', color: '#6b6b6b' };

  const sectionLabel = {
    margin: '0 0 7px', fontSize: '10px', fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: isDark ? 'rgba(255,255,255,0.35)' : '#6b6b6b',
  };

  const trackStyle = {
    display: 'flex', gap: '3px', borderRadius: 0, padding: '3px',
    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
  };

  return (
    <div style={{ padding: inline ? '4px 0' : '16px', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: inline ? 'auto' : '210px' }}>

      {/* ── Appearance ── */}
      <div>
        <p style={sectionLabel}>{t.nav.appearance}</p>
        <div style={trackStyle}>
          <button onClick={() => handleTheme('light')} style={{ ...pillBase, ...(isDark ? pillOff : pillOn) }}>
            <SunIcon animStyle={iconAnim(!isDark)} />
            {t.nav.light}
          </button>
          <button onClick={() => handleTheme('dark')} style={{ ...pillBase, ...(isDark ? pillOn : pillOff) }}>
            <MoonIcon animStyle={iconAnim(isDark)} />
            {t.nav.dark}
          </button>
        </div>
      </div>

      {/* ── Language ── */}
      <div>
        <p style={sectionLabel}>{t.nav.language}</p>
        <div style={trackStyle}>
          <button onClick={() => lang !== 'es' && setLang('es')} style={{ ...pillBase, ...(lang === 'es' ? pillOn : pillOff) }}>ES</button>
          <button onClick={() => lang !== 'en' && setLang('en')} style={{ ...pillBase, ...(lang === 'en' ? pillOn : pillOff) }}>EN</button>
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PREFERENCES DROPDOWN (click-based, desktop)
═══════════════════════════════════════════════════════════ */
function PreferencesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Apariencia e idioma"
        className={`pref-trigger-btn ${open ? 'active' : ''}`}
        style={{
          minWidth: '44px', minHeight: '44px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', outline: 'none',
        }}
      >
        <ContrastIcon size={18} />
      </button>

      <div className="pref-dropdown-panel" style={{
        position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 200,
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
        transformOrigin: 'top right',
        transition: 'opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}>
        <PreferencesPanel />
      </div>
    </div>
  );
}


function UserMenu() {
  const { user, loading, logout } = useAuth();
  const { theme } = usePrefs();
  const isDark = theme === 'dark';
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (loading) return null;

  const textCyan    = isDark ? '#f5f5f5'                  : '#0a0a0a';
  const borderLogin = isDark ? 'rgba(255,255,255,0.15)'   : 'rgba(0,0,0,0.12)';
  const bgLogin     = isDark ? 'rgba(255,255,255,0.05)'   : 'rgba(0,0,0,0.03)';
  const textMain    = isDark ? '#f5f5f5'                  : '#0a0a0a';
  const cardBg      = isDark ? 'rgba(22, 22, 22, 0.98)'   : 'rgba(255, 255, 255, 0.98)';
  const cardBorder  = isDark ? 'rgba(255,255,255,0.1)'    : 'rgba(0,0,0,0.1)';

  if (!user) {
    return (
      <Link
        to="/login"
        style={{
          textDecoration: 'none',
          padding: '8px 20px',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          touchAction: 'manipulation',
          fontFamily: "'Inter',sans-serif",
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: textMain,
          border: `1px solid ${borderLogin}`,
          borderRadius: 999,
          boxShadow: 'none',
          background: 'transparent',
          letterSpacing: '0.06em'
        }}
      >
        {t.nav.login}
      </Link>
    );
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          height: '44px',
          cursor: 'pointer',
          border: `1px solid ${borderLogin}`,
          borderRadius: 0,
          background: bgLogin,
          color: textMain,
          fontFamily: "'Inter', sans-serif",
          fontSize: '14px',
          fontWeight: 600,
          boxShadow: 'none',
          letterSpacing: '0.02em',
          outline: 'none',
        }}
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${textCyan}` }} />
        ) : (
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: isDark ? '#f5f5f5' : '#0a0a0a', color: isDark ? '#0a0a0a' : '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
        <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name?.split(' ')[0]}
        </span>
        <svg style={{ width: 12, height: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          borderRadius: '10px',
          boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' : '0 16px 40px rgba(0,0,0,0.1)',
          padding: '6px',
          minWidth: '190px',
          zIndex: 200,
        }}>
          {user.email && (
            <div style={{
              padding: '4px 12px 10px',
              borderBottom: '1px solid var(--px-border)',
              marginBottom: 8,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
              color: isDark ? 'rgba(255,255,255,0.5)' : '#6b6b6b',
              wordBreak: 'break-all',
            }}>
              {user.email}
            </div>
          )}

          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '8px 12px',
              borderRadius: 0,
              fontFamily: "'Inter',sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: textMain,
              textDecoration: 'none',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.target.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            Dashboard
          </Link>

          <Link
            to="/deploy"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '8px 12px',
              borderRadius: 0,
              fontFamily: "'Inter',sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: textMain,
              textDecoration: 'none',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.target.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            {t.nav.new_deploy}
          </Link>

          <button
            onClick={logout}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 0,
              textAlign: 'left',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isDark ? '#f5f5f5' : '#0a0a0a',
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              letterSpacing: '0.01em',
              transition: 'background 0.1s',
              outline: 'none',
            }}
            onMouseEnter={e => e.target.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            {t.nav.logout}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR (pure static shell — NEVER re-renders on prefs change)
   Language labels toggle via CSS [data-lang] attribute on <html>
═══════════════════════════════════════════════════════════ */
const Navbar = React.memo(function Navbar() {
  const { theme } = usePrefs();
  const isDark = theme === 'dark';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const textMain   = isDark ? '#f5f5f5'                  : '#0a0a0a';
  const textMuted  = isDark ? 'rgba(255,255,255,0.6)'    : '#6b6b6b';
  const navBg = isDark ? 'rgba(10, 10, 10, 0.58)' : 'rgba(255, 255, 255, 0.60)';
  const navBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <nav
      className="fixed z-50 hidden md:block"
      style={{
        top: scrolled ? 10 : 0,
        left: scrolled ? 14 : 0,
        right: scrolled ? 14 : 0,
        background: navBg,
        border: `1px solid ${navBorder}`,
        borderRadius: scrolled ? 16 : 0,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: scrolled
          ? (isDark ? '0 8px 32px rgba(0,0,0,0.55)' : '0 8px 32px rgba(0,0,0,0.1)')
          : (isDark ? '0 1px 0 rgba(255,255,255,0.04)' : '0 1px 0 rgba(0,0,0,0.06)'),
        transition: 'top 0.4s cubic-bezier(0.16,1,0.3,1), left 0.4s cubic-bezier(0.16,1,0.3,1), right 0.4s cubic-bezier(0.16,1,0.3,1), border-radius 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease',
      }}
    >
      <div style={{ width: '100%', display: 'block', pointerEvents: 'none' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center w-full" style={{ pointerEvents: 'auto' }}>

          {/* LEFT: Logo + Herramientas */}
          <div className="flex items-center gap-6">
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 4px', touchAction: 'manipulation' }}>
              <span style={{ width: 10, height: 10, background: textMain, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18, color: textMain, letterSpacing: '0.04em', textTransform: 'uppercase' }}>StarDest</span>
            </Link>

            {/* Desktop mega-menu — label switches via CSS [data-lang] */}
            <div className="relative group hidden md:block">
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', minHeight: 44, minWidth: 'auto', cursor: 'pointer', touchAction: 'manipulation', fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, color: textMuted, background: 'transparent', border: 'none', letterSpacing: '0.01em' }}
              >
                <span className="nav-label-es">Herramientas</span>
                <span className="nav-label-en">Tools</span>
                <svg style={{ width:14, height:14, transition:'transform 0.2s' }} className="group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute top-full left-0 w-full h-3" />
              <div className="absolute top-[calc(100%+4px)] left-0 w-[420px] lg:w-[500px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0">
                <div className="mega-menu-panel" style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: isDark ? 'rgba(24,24,27,0.98)' : 'rgba(255,255,255,0.98)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
                  boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.5)' : '0 16px 40px rgba(0,0,0,0.1)',
                }}>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 nav-tools-es">
                      {NAV_TOOLS.es.map((tool) => (
                        <ToolLink key={tool.label} tool={tool} isDark={isDark} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 nav-tools-en">
                      {NAV_TOOLS.en.map((tool) => (
                        <ToolLink key={tool.label} tool={tool} isDark={isDark} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            <PreferencesDropdown />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
});

function ToolLink({ tool }) {
  const restBg = 'transparent';
  return (
    <Link to={tool.to} style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: '8px', border: '1px solid var(--px-border)', background: restBg, transition: 'border-color 0.18s, background 0.18s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.background = 'var(--px-bg2)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; e.currentTarget.style.background = restBg; }}
    >
      <div style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid var(--px-border)', background: 'var(--px-bg)' }}>
        <svg style={{ width: 16, height: 16, color: 'var(--px-white)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">{tool.icon}</svg>
      </div>
      <div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--px-white)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{tool.label}</div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--px-muted)', lineHeight: 1.4 }}>{tool.desc}</div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════════ */
function App() {
  return (
    <>
      <Navbar />
      <MobileBottomNav />
      <div className="pt-0 md:pt-14 pb-28 md:pb-0 min-h-screen">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/deploy"    element={<Deploy />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
