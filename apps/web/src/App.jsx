import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Deploy from './pages/Deploy';
import Dashboard from './pages/Dashboard';
import Console from './pages/Console';
import Board from './pages/Board';
import { useAuth } from './hooks/useAuth';
import BrandMark from './components/BrandMark';

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
    { to: '/board', label: 'Pizarra',    desc: 'Diseña tu arquitectura visualmente',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    { to: '#', label: 'Dominios',   desc: 'Configura URLs y certificados',             icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /> },
  ],
  en: [
    { to: '/deploy', label: 'Deploy',     desc: 'Ship your code in seconds',          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /> },
    { to: '/board', label: 'Board',       desc: 'Design your architecture visually',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
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

const ChevronIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

const HomeNavIcon   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const DeployNavIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
const GridNavIcon   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
const PersonNavIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

function Avatar({ user, size = 28 }) {
  if (user.avatar) {
    return <img src={user.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--px-accent)', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700,
    }}>
      {user.name?.charAt(0).toUpperCase()}
    </span>
  );
}

/* Ítem de menú desplegable (usuario, móvil) */
const menuItem = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8, border: 'none', background: 'transparent',
  color: 'var(--px-white)', fontSize: 14, fontWeight: 500, textDecoration: 'none',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
};
const hoverOn = e => { e.currentTarget.style.background = 'var(--px-glass-hover)'; };
const hoverOff = e => { e.currentTarget.style.background = 'transparent'; };

/* ═══════════════════════════════════════════════════════════
   MOBILE BOTTOM NAV
═══════════════════════════════════════════════════════════ */
function BottomNavItem({ to, icon, label, active, onClick }) {
  const s = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: '8px 4px', border: 'none', flex: 1,
    background: 'transparent',
    color: active ? 'var(--px-accent)' : 'var(--px-muted)', cursor: 'pointer',
    transition: 'color 0.2s',
    textDecoration: 'none', outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };
  const inner = (
    <>
      {icon}
      {label && <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1 }}>{label}</span>}
    </>
  );
  if (onClick) return <button onClick={onClick} style={s}>{inner}</button>;
  return <Link to={to} style={s}>{inner}</Link>;
}

function MobileBottomNav() {
  const { user, loading, logout } = useAuth();
  const t = useTranslation();
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

  if (loading) return null;

  const popupStyle = {
    position: 'absolute', bottom: 'calc(100% + 10px)',
    background: 'var(--px-surface)', border: '1px solid var(--px-border)', borderRadius: 16,
    boxShadow: 'var(--px-shadow-md)', overflow: 'hidden',
  };

  return (
    <div ref={wrapRef} className="fixed md:hidden z-50" style={{ bottom: 12, left: 12, right: 12 }}>

      {showPrefs && (
        <div style={{ ...popupStyle, right: 0 }}>
          <PreferencesPanel />
        </div>
      )}

      {showUser && user && (
        <div style={{ ...popupStyle, right: 0, minWidth: 220, padding: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 12px', marginBottom: 6, borderBottom: '1px solid var(--px-border)' }}>
            <Avatar user={user} size={32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--px-white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
              {user.email && <div style={{ fontSize: 12, color: 'var(--px-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>}
            </div>
          </div>
          <Link to="/dashboard" onClick={closeAll} style={menuItem} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            <GridNavIcon /> {t.nav.dashboard}
          </Link>
          <button onClick={() => { closeAll(); logout(); }} style={{ ...menuItem, color: 'var(--px-red)', fontWeight: 600 }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t.nav.logout}
          </button>
        </div>
      )}

      <nav style={{
        background: 'var(--px-surface)', border: '1px solid var(--px-border)', borderRadius: 18,
        boxShadow: 'var(--px-shadow-md)', display: 'flex', alignItems: 'stretch', padding: '4px 6px',
      }}>
        <BottomNavItem to="/" icon={<HomeNavIcon />} label={t.nav.home} active={loc.pathname === '/'} />
        <BottomNavItem to="/deploy" icon={<DeployNavIcon />} label={t.nav.deploy} active={loc.pathname === '/deploy'} />
        {user && <BottomNavItem to="/dashboard" icon={<GridNavIcon />} label={t.nav.dashboard} active={loc.pathname === '/dashboard'} />}
        <BottomNavItem
          icon={<ContrastIcon size={20} />} label={t.nav.theme}
          active={showPrefs}
          onClick={() => { setShowUser(false); setShowPrefs(o => !o); }}
        />
        {user ? (
          <BottomNavItem
            active={showUser}
            label={(user.name?.split(' ')[0] || '').slice(0, 8)}
            onClick={() => { setShowPrefs(false); setShowUser(o => !o); }}
            icon={<Avatar user={user} size={22} />}
          />
        ) : (
          <BottomNavItem to="/login" icon={<PersonNavIcon />} label={t.nav.login} active={loc.pathname === '/login'} />
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
    opacity:    active ? 1 : 0.4,
    flexShrink: 0,
  });

  const pillBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    flex: 1, padding: '7px 12px', borderRadius: 999, border: 'none',
    cursor: 'pointer', fontWeight: 600, fontSize: '13px', lineHeight: 1,
    transition: 'background 0.18s ease, color 0.18s ease',
    outline: 'none', whiteSpace: 'nowrap', fontFamily: 'inherit',
  };
  const pillOn  = { background: 'var(--px-accent)', color: 'var(--px-accent-fg)' };
  const pillOff = { background: 'transparent', color: 'var(--px-muted)' };

  const sectionLabel = { margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: 'var(--px-muted)' };
  const trackStyle = { display: 'flex', gap: '4px', borderRadius: 999, padding: '4px', background: 'var(--px-bg2)', border: '1px solid var(--px-border)' };

  return (
    <div style={{ padding: inline ? '4px 0' : '16px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: inline ? 'auto' : '230px' }}>
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

      <div>
        <p style={sectionLabel}>{t.nav.language}</p>
        <div style={trackStyle}>
          <button onClick={() => lang !== 'es' && setLang('es')} style={{ ...pillBase, ...(lang === 'es' ? pillOn : pillOff) }}>Español</button>
          <button onClick={() => lang !== 'en' && setLang('en')} style={{ ...pillBase, ...(lang === 'en' ? pillOn : pillOff) }}>English</button>
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
        aria-expanded={open}
        className={`pref-trigger-btn ${open ? 'active' : ''}`}
        style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <ContrastIcon size={20} />
      </button>

      <div className="pref-dropdown-panel" style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transform: open ? 'translateY(0)' : 'translateY(-6px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease',
      }}>
        <PreferencesPanel />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   USER MENU (desktop)
═══════════════════════════════════════════════════════════ */
function UserMenu() {
  const { user, loading, logout } = useAuth();
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (loading) return <span style={{ width: 120 }} />;

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link to="/login" className="tv-nav-link">{t.nav.login}</Link>
        <Link to="/login" className="px-btn" style={{ textDecoration: 'none', padding: '9px 20px', fontSize: 14 }}>
          {t.nav.get_started}
        </Link>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`tv-nav-link ${open ? 'active' : ''}`}
        style={{ paddingLeft: 6 }}
      >
        <Avatar user={user} size={28} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name?.split(' ')[0]}
        </span>
        <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--px-muted)' }}>
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          background: 'var(--px-surface)', border: '1px solid var(--px-border)',
          borderRadius: 14, boxShadow: 'var(--px-shadow-md)', padding: 6, minWidth: 240,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 12px', marginBottom: 6, borderBottom: '1px solid var(--px-border)' }}>
            <Avatar user={user} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--px-white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
              {user.email && <div style={{ fontSize: 12, color: 'var(--px-muted)', wordBreak: 'break-all' }}>{user.email}</div>}
            </div>
          </div>
          <Link to="/dashboard" onClick={() => setOpen(false)} style={menuItem} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            {t.nav.dashboard}
          </Link>
          <Link to="/deploy" onClick={() => setOpen(false)} style={menuItem} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            {t.nav.new_deploy}
          </Link>
          <div style={{ height: 1, background: 'var(--px-border)', margin: '6px 0' }} />
          <button onClick={logout} style={{ ...menuItem, color: 'var(--px-red)' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            {t.nav.logout}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR (barra sólida de ancho completo, estilo TradingView)
   Language labels toggle via CSS [data-lang] attribute on <html>
═══════════════════════════════════════════════════════════ */
const Navbar = React.memo(function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkClass = (path) => `tv-nav-link ${pathname.startsWith(path) ? 'active' : ''}`;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 hidden md:block"
      style={{
        height: 64,
        background: 'var(--nav-bg)',
        borderBottom: `1px solid ${scrolled ? 'var(--px-border)' : 'transparent'}`,
        transition: 'border-color 0.2s ease',
      }}
    >
      <div style={{ maxWidth: 1440, height: '100%', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>

        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          <BrandMark />
          <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--px-white)', letterSpacing: '-0.02em' }}>StarDest</span>
        </Link>

        {/* Herramientas: mega-menú al pasar el mouse */}
        <div className="relative group">
          <button className="tv-nav-link" aria-haspopup="true">
            <span className="nav-label-es">Herramientas</span>
            <span className="nav-label-en">Tools</span>
            <span className="group-hover:rotate-180" style={{ display: 'inline-flex', transition: 'transform 0.2s', color: 'var(--px-muted)' }}><ChevronIcon /></span>
          </button>
          <div className="absolute top-full left-0 w-full h-3" />
          <div className="absolute top-[calc(100%+8px)] left-0 w-[520px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 -translate-y-1 group-hover:translate-y-0">
            <div className="mega-menu-panel" style={{ padding: 10 }}>
              <div className="grid grid-cols-2 gap-1 nav-tools-es">
                {NAV_TOOLS.es.map((tool) => <ToolLink key={tool.label} tool={tool} />)}
                <AdminToolLink lang="es" />
              </div>
              <div className="grid grid-cols-2 gap-1 nav-tools-en">
                {NAV_TOOLS.en.map((tool) => <ToolLink key={tool.label} tool={tool} />)}
                <AdminToolLink lang="en" />
              </div>
            </div>
          </div>
        </div>

        <Link to="/deploy" className={linkClass('/deploy')}>Deploy</Link>
        <Link to="/board" className={linkClass('/board')}>
          <span className="nav-label-es">Pizarra</span>
          <span className="nav-label-en">Board</span>
        </Link>
        <DashboardNavLink className={linkClass('/dashboard')} />

        <span style={{ flex: 1 }} />

        <PreferencesDropdown />
        <UserMenu />
      </div>
    </nav>
  );
});

// Aparte para que el Navbar memoizado no se suscriba a useAuth
function DashboardNavLink({ className }) {
  const { user } = useAuth();
  if (!user) return null;
  return <Link to="/dashboard" className={className}>Dashboard</Link>;
}

function ToolLink({ tool }) {
  return (
    <Link to={tool.to} style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 14, padding: 14, borderRadius: 12, transition: 'background 0.15s' }}
      onMouseEnter={hoverOn}
      onMouseLeave={hoverOff}
    >
      <div style={{ flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--px-accent-soft)', color: 'var(--px-accent)' }}>
        <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">{tool.icon}</svg>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--px-white)', marginBottom: 3 }}>{tool.label}</div>
        <div style={{ fontSize: 13, color: 'var(--px-muted)', lineHeight: 1.45 }}>{tool.desc}</div>
      </div>
    </Link>
  );
}

// Solo cosmético: la protección real está en el backend (/admin/* responde 404 a no-admins).
// Componente aparte para que el Navbar memoizado no se suscriba a useAuth.
const CONSOLE_TOOL = {
  es: { to: '/console', label: 'Console', desc: 'Administración de la plataforma' },
  en: { to: '/console', label: 'Console', desc: 'Platform administration' },
};
const CONSOLE_ICON = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />;

function AdminToolLink({ lang }) {
  const { user } = useAuth();
  if (!user?.isAdmin) return null;
  return <ToolLink tool={{ ...CONSOLE_TOOL[lang], icon: CONSOLE_ICON }} />;
}

/* ═══════════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════════ */
function App() {
  return (
    <>
      <Navbar />
      <MobileBottomNav />
      <div className="pt-0 md:pt-16 pb-28 md:pb-0 min-h-screen">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/deploy"    element={<Deploy />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/console"   element={<Console />} />
          <Route path="/board"     element={<Board />} />
          <Route path="/board/:id" element={<Board />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
