import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Deploy from './pages/Deploy';

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
    borderRadius: '7px', border: '1px solid transparent',
    cursor: 'pointer', fontWeight: 700, fontSize: '12px',
    letterSpacing: '0.04em', lineHeight: 1,
    transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
    outline: 'none', whiteSpace: 'nowrap',
  };
  const pillOn = isDark
    ? { background: 'rgba(47,74,103,0.55)', borderColor: 'rgba(203,205,211,0.2)', color: '#fff' }
    : { background: '#ffffff', borderColor: 'rgba(100,150,200,0.3)', color: '#0d1b2a', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
  
  const pillOff = isDark
    ? { background: 'transparent', borderColor: 'rgba(203,205,211,0.05)', color: 'rgba(203,205,211,0.45)' }
    : { background: 'transparent', borderColor: 'transparent', color: '#4a6a8a' };

  const sectionLabel = {
    margin: '0 0 7px', fontSize: '10px', fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: isDark ? 'rgba(203,205,211,0.38)' : '#4a6a8a',
  };

  const trackStyle = {
    display: 'flex', gap: '3px', borderRadius: '9px', padding: '3px',
    background: isDark ? 'rgba(15,44,69,0.5)' : 'rgba(180, 210, 245, 0.4)',
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
        className="pref-trigger-btn"
        style={{
          minWidth: '40px', minHeight: '40px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '10px',
          border: '1px solid rgba(47,74,103,0.5)',
          background: open ? 'rgba(47,74,103,0.35)' : 'rgba(15,44,69,0.3)',
          color: open ? '#fff' : 'rgba(203,205,211,0.8)',
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
        borderRadius: '16px', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        border: '1px solid rgba(47,74,103,0.4)',
        background: 'rgba(11,15,25,0.97)',
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
  // Read lang directly from DOM attribute — no subscription needed here
  // since the drawer re-renders on open anyway
  const lang = document.documentElement.getAttribute('data-lang') || 'es';
  const TOOLS = NAV_TOOLS[lang] || NAV_TOOLS.es;
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
      <div className="h-full bg-[#0b0f19]/95 backdrop-blur-xl border-l border-[#2F4A67]/40 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2F4A67]/30">
          <span className="text-white font-bold text-base">{labelMenu}</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 transition"
            style={{ minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preferences inline */}
        <div className="px-4 py-2 border-b border-[#2F4A67]/20">
          <PreferencesPanel inline />
        </div>

        {/* Accordion */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {sections.map((section) => {
            const isOpen = openSection === section.id;
            return (
              <div key={section.id} className="rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  className="w-full flex items-center justify-between px-4 rounded-xl hover:bg-[#2F4A67]/15 active:bg-[#2F4A67]/25 transition group"
                  style={{ minHeight: '52px', cursor: 'pointer' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2F4A67]/60 bg-[#0F2C45]/40 text-white group-hover:border-[#2F4A67] transition flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{section.icon}</svg>
                    </div>
                    <span className="text-sm font-semibold text-white">{section.label}</span>
                  </div>
                  <svg className={`w-4 h-4 text-[#CBCDD3] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="pl-3 pr-1 pb-2 pt-1 space-y-0.5">
                    {section.items.map((item) => (
                      <Link key={item.label} to={item.to} onClick={onClose}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#2F4A67]/20 active:bg-[#2F4A67]/30 transition group/item"
                      >
                        <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-[#2F4A67]/60 bg-[#0F2C45]/40 text-white group-hover/item:border-white/30 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white leading-tight">{item.label}</p>
                          <p className="text-xs text-[#CBCDD3]/80 mt-0.5 leading-tight">{item.desc}</p>
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
        <div className="px-5 py-5 border-t border-[#2F4A67]/30">
          <Link to="/login" onClick={onClose}
            className="block w-full text-center py-3 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 rounded-xl transition text-sm font-medium"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR (pure static shell — NEVER re-renders on prefs change)
   Language labels toggle via CSS [data-lang] attribute on <html>
═══════════════════════════════════════════════════════════ */
const Navbar = React.memo(function Navbar({ mobileOpen, onHamburger, location }) {
  // Static tools for the desktop mega-menu — rendered once per open
  // The mega-menu content updates via CSS [data-lang] class toggling
  return (
    <nav className="fixed top-0 left-0 right-0 w-full z-50 border-b border-[#2F4A67]/40 shadow-lg">
      <div style={{
        width: '100%',
        background: 'rgba(11, 18, 35, 0.35)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(47,74,103,0.15), 0 4px 24px rgba(0,0,0,0.25)',
        display: 'block',
        pointerEvents: 'none',
      }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center w-full" style={{ pointerEvents: 'auto' }}>

          {/* LEFT: Logo + Herramientas */}
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl sm:text-2xl font-bold text-white hover:text-[#CBCDD3] flex items-center gap-2 sm:gap-3 group"
              style={{ padding: '6px 4px', minHeight: '44px', alignItems: 'center', touchAction: 'manipulation' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 sm:w-8 sm:h-8 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
              </svg>
              StarDest
            </Link>

            {/* Desktop mega-menu — label switches via CSS [data-lang] */}
            <div className="relative group hidden md:block">
              <button
                className="flex items-center gap-1 text-sm font-medium text-[#CBCDD3]/80 hover:text-white transition"
                style={{ padding: '14px 12px', minHeight: '44px', minWidth: '130px', cursor: 'pointer', touchAction: 'manipulation' }}
              >
                {/* Both labels — CSS hides the inactive one */}
                <span className="nav-label-es">Herramientas</span>
                <span className="nav-label-en">Tools</span>
                <svg className="w-4 h-4 transition-transform group-hover:rotate-180 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute top-full left-0 w-full h-3" />
              <div className="absolute top-[calc(100%+4px)] left-0 w-[420px] lg:w-[500px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0">
                <div className="mega-menu-panel" style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  background: 'rgba(11, 15, 25, 0.97)',
                  backdropFilter: 'blur(24px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                  border: '1px solid rgba(47,74,103,0.4)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 nav-tools-es">
                      {NAV_TOOLS.es.map((tool) => (
                        <ToolLink key={tool.label} tool={tool} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 nav-tools-en">
                      {NAV_TOOLS.en.map((tool) => (
                        <ToolLink key={tool.label} tool={tool} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <PreferencesDropdown />
            </div>
            <Link
              to="/login"
              className={`text-sm font-medium transition hidden md:flex ${location.pathname === '/login' ? 'text-[#CBCDD3]' : 'text-[#CBCDD3]/80 hover:text-white'}`}
              style={{ padding: '10px 12px', minHeight: '44px', alignItems: 'center', touchAction: 'manipulation' }}
            >
              Login
            </Link>
            <button
              onClick={onHamburger}
              aria-label="Abrir menú"
              className="md:hidden flex flex-col justify-center items-center rounded-lg border border-[#2F4A67]/50 bg-[#0F2C45]/30 hover:bg-[#2F4A67]/30 transition gap-1.5 p-2"
              style={{ minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}
            >
              <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
});

function ToolLink({ tool }) {
  return (
    <Link to={tool.to} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{tool.icon}</svg>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-white mb-0.5">{tool.label}</span>
        <span className="text-xs text-[#CBCDD3] leading-tight">{tool.desc}</span>
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
        </Routes>
      </div>
    </>
  );
}

export default App;
