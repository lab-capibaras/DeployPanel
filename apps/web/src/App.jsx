import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
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

/* ═══════════════════════════════════════════════════════════
   PREFERENCES PANEL (only this component re-renders on prefs change)
═══════════════════════════════════════════════════════════ */
function PreferencesPanel({ inline = false }) {
  const { theme, lang, setTheme, setLang } = usePrefs();
  const t = useTranslation();
  const isDark = theme === 'dark';

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
  const pillOn = { background: 'var(--px-red)', borderColor: 'var(--px-red)', color: '#ffffff' };

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
          <button onClick={() => isDark && setTheme('light')} style={{ ...pillBase, ...(isDark ? pillOff : pillOn) }}>
            <SunIcon animStyle={iconAnim(!isDark)} />
            {t.nav.light}
          </button>
          <button onClick={() => !isDark && setTheme('dark')} style={{ ...pillBase, ...(isDark ? pillOn : pillOff) }}>
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


/* ═══════════════════════════════════════════════════════════
   MOBILE DRAWER — reads lang from DOM to avoid re-render
   (only re-renders when mobileOpen changes)
═══════════════════════════════════════════════════════════ */
function MobileDrawer({ open, onClose, openSection, setOpenSection }) {
  const { user } = useAuth();
  const { theme } = usePrefs();
  const isDark = theme === 'dark';
  // Read lang directly from DOM attribute — no subscription needed here
  // since the drawer re-renders on open anyway
  const lang = document.documentElement.getAttribute('data-lang') || 'es';
  const baseTools = NAV_TOOLS[lang] || NAV_TOOLS.es;
  const TOOLS = user ? [
    {
      to: '/dashboard',
      label: 'Dashboard',
      desc: lang === 'es' ? 'Gestiona tus deploys activos' : 'Manage your active deployments',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
    },
    ...baseTools
  ] : baseTools;
  
  const labelMenu         = lang === 'es' ? 'Menú' : 'Menu';
  const labelHerramientas = lang === 'es' ? 'Herramientas' : 'Tools';

  const sections = [{
    id: 'herramientas',
    label: labelHerramientas,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    items: TOOLS,
  }];

  return (
    <div className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 md:hidden transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className={`h-full backdrop-blur-xl border-l flex flex-col ${isDark ? 'bg-[#0a0a0a]/95 border-white/10' : 'bg-white/95 border-black/10'}`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <span className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>{labelMenu}</span>
          <button
            onClick={onClose}
            className={`flex items-center justify-center rounded-none border transition ${isDark ? 'border-white/15 text-white/60 hover:text-white hover:bg-white/10' : 'border-black/10 text-black/60 hover:text-black hover:bg-black/5'}`}
            style={{ minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preferences inline */}
        <div className={`px-4 py-2 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <PreferencesPanel inline />
        </div>

        {/* Accordion */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {sections.map((section) => {
            const isOpen = openSection === section.id;
            return (
              <div key={section.id} className="rounded-none overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  className={`w-full flex items-center justify-between px-4 rounded-none transition group ${isDark ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-black/5 active:bg-black/10'}`}
                  style={{ minHeight: '52px', cursor: 'pointer' }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-none border transition flex-shrink-0 ${isDark ? 'border-white/15 bg-white/5 text-white group-hover:border-white/30' : 'border-black/10 bg-black/5 text-black group-hover:border-black/20'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{section.icon}</svg>
                    </div>
                    <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{section.label}</span>
                  </div>
                  <svg className={`w-4 h-4 transition-transform duration-300 ${isDark ? 'text-white/60' : 'text-black/60'} ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="pl-3 pr-1 pb-2 pt-1 space-y-0.5">
                    {section.items.map((item) => (
                      <Link key={item.label} to={item.to} onClick={onClose}
                        className={`flex items-center gap-3 px-3 py-3 rounded-none transition group/item ${isDark ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-black/5 active:bg-black/10'}`}
                      >
                        <div className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-none border transition ${isDark ? 'border-white/15 bg-white/5 text-white group-hover/item:border-white/30' : 'border-black/10 bg-black/5 text-black group-hover/item:border-black/20'}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-black'}`}>{item.label}</p>
                          <p className={`text-xs mt-0.5 leading-tight ${isDark ? 'text-white/60' : 'text-black/60'}`}>{item.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`px-5 py-5 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <UserMobileMenu onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function UserMobileMenu({ onClose }) {
  const { user, loading, logout } = useAuth();
  const { theme } = usePrefs();
  const isDark = theme === 'dark';
  const t = useTranslation();
  if (loading) return null;

  if (!user) {
    return (
      <Link to="/login" onClick={onClose}
        className={`block w-full text-center py-3 border rounded-none transition text-sm font-medium cursor-pointer ${isDark ? 'border-white/15 text-white/70 hover:text-white hover:bg-white/10' : 'border-black/15 text-black/70 hover:text-black hover:bg-black/5'}`}
        style={{ textDecoration: 'none' }}
      >
        {t.nav.login}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center gap-3 px-3 py-2 border rounded-none ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'}`}>
        {user.avatar ? (
          <img src={user.avatar} alt="" className={`w-8 h-8 rounded-full border ${isDark ? 'border-white/30' : 'border-black/20'}`} />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="overflow-hidden">
          <p className={`text-sm font-bold leading-tight truncate ${isDark ? 'text-white' : 'text-black'}`}>{user.name}</p>
          <p className={`text-xs leading-tight truncate ${isDark ? 'text-white/50' : 'text-black/50'}`}>{user.email || user.provider}</p>
        </div>
      </div>

      <Link
        to="/dashboard"
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'center',
          padding: '10px 12px',
          fontFamily: "'Inter',sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: isDark ? '#f5f5f5' : '#0a0a0a',
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
          borderRadius: 0,
          textDecoration: 'none',
        }}
      >
        Dashboard
      </Link>

      <Link
        to="/deploy"
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'center',
          padding: '10px 12px',
          fontFamily: "'Inter',sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: isDark ? '#f5f5f5' : '#0a0a0a',
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
          borderRadius: 0,
          textDecoration: 'none',
        }}
      >
        {t.nav.new_deploy}
      </Link>

      <button
        onClick={() => { logout(); onClose(); }}
        className={`block w-full text-center py-3 border rounded-none transition text-sm font-medium cursor-pointer ${isDark ? 'border-white/15 text-white/70 hover:text-white hover:bg-white/10' : 'border-black/15 text-black/70 hover:text-black hover:bg-black/5'}`}
        style={{ background: 'transparent', borderRadius: 0, marginTop: '4px' }}
      >
        {t.nav.logout}
      </button>
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
          color: 'var(--px-red)',
          border: '1px solid var(--px-red)',
          borderRadius: 0,
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
const Navbar = React.memo(function Navbar({ mobileOpen, onHamburger, location }) {
  const { theme } = usePrefs();
  const { user } = useAuth();
  const isDark = theme === 'dark';
  const textMain   = isDark ? '#f5f5f5'                  : '#0a0a0a';
  const textMuted  = isDark ? 'rgba(255,255,255,0.6)'    : '#6b6b6b';
  // Static tools for the desktop mega-menu — rendered once per open
  // The mega-menu content updates via CSS [data-lang] class toggling
  const navBg = isDark ? 'rgba(10, 10, 10, 0.8)' : 'rgba(255, 255, 255, 0.8)';
  const navBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <nav className="fixed top-0 left-0 right-0 w-full z-50" style={{
      background: navBg,
      borderBottom: `1px solid ${navBorder}`,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: isDark ? '0 1px 0 rgba(255,255,255,0.04)' : '0 1px 0 rgba(0,0,0,0.06)',
    }}>
      <div style={{ width: '100%', display: 'block', pointerEvents: 'none' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center w-full" style={{ pointerEvents: 'auto' }}>

          {/* LEFT: Logo + Herramientas */}
          <div className="flex items-center gap-6">
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 4px', touchAction: 'manipulation' }}>
              <span style={{ width: 10, height: 10, background: 'var(--px-red)', display: 'inline-block', flexShrink: 0 }} />
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
            <div className="hidden md:flex items-center">
              <PreferencesDropdown />
            </div>
            <UserMenu />
            <button
              onClick={onHamburger}
              aria-label={document.documentElement.getAttribute('data-lang') === 'en' ? 'Open menu' : 'Abrir menú'}
              className={`md:hidden flex flex-col justify-center items-center rounded-none border transition gap-1.5 p-2 ${
                isDark
                  ? 'border-white/15 bg-white/5 hover:bg-white/10'
                  : 'border-black/10 bg-black/[0.03] hover:bg-black/5'
              }`}
              style={{ minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}
            >
              <span className={`block w-full h-0.5 rounded transition-all duration-300 ${isDark ? 'bg-white' : 'bg-black'} ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-full h-0.5 rounded transition-all duration-300 ${isDark ? 'bg-white' : 'bg-black'} ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-full h-0.5 rounded transition-all duration-300 ${isDark ? 'bg-white' : 'bg-black'} ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
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
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-red)'; e.currentTarget.style.background = 'rgba(255,43,0,0.04)'; }}
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
  const location = useLocation();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [openSection, setOpenSection] = useState('herramientas');
  const drawerRef = useRef(null);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const h = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setMobileOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <Navbar
        mobileOpen={mobileOpen}
        onHamburger={() => setMobileOpen(o => !o)}
        location={location}
      />

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" aria-hidden="true" />}

      <div ref={drawerRef}>
        <MobileDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
      </div>

      <div className="pt-14 min-h-screen">
        <Routes>
          <Route path="/"       element={<Home />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/deploy" element={<Deploy />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
