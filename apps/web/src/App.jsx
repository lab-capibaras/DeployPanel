import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Deploy from './pages/Deploy';

const TOOLS = [
  {
    to: '/deploy',
    label: 'Despliegue',
    desc: 'Despliega tu código en segundos',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
  },
  {
    to: '#',
    label: 'Pizarra',
    desc: 'Diseña tu arquitectura visualmente',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    ),
  },
  {
    to: '#',
    label: 'Monitoreo',
    desc: 'Métricas de CPU en tiempo real',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
  },
  {
    to: '#',
    label: 'Dominios',
    desc: 'Configura URLs y certificados',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    ),
  },
];

const NAV_SECTIONS = [
  {
    id: 'herramientas',
    label: 'Herramientas',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
    items: TOOLS,
  },
  // Agrega más secciones aquí en el futuro, ej:
  // { id: 'recursos', label: 'Recursos', icon: (...), items: [...] },
];

function App() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState('herramientas'); // open by default
  const drawerRef = useRef(null);

  // Close on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close when clicking outside
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileOpen]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      {/* ===== NAVBAR ===== */}
      <nav className="fixed top-0 left-0 right-0 w-full z-50 border-b border-[#2F4A67]/40 shadow-lg">
        <glass-element
          className="w-full block"
          full-width="true"
          auto-size="true"
          radius="0"
          no-border="true"
          depth="2"
          blur="3"
          strength="20"
          background-color="rgba(11, 15, 25, 0.7)"
          chromatic-aberration="1"
          style={{ '--glass-padding': '0' }}
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center w-full">

            {/* LEFT: Logo + Desktop Herramientas */}
            <div className="flex items-center gap-6">
              <Link to="/" className="text-xl sm:text-2xl font-bold text-white hover:text-[#CBCDD3] flex items-center gap-2 sm:gap-3 group" style={{ padding: '6px 4px', minHeight: '44px', alignItems: 'center', touchAction: 'manipulation' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 sm:w-8 sm:h-8 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                </svg>
                StarDest
              </Link>

              {/* Desktop Herramientas mega-menu (hover) */}
              <div className="relative group hidden md:block">
                <button
                  className="flex items-center gap-1 text-sm font-medium text-[#CBCDD3]/80 hover:text-white transition"
                  style={{ padding: '14px 12px', minHeight: '44px', cursor: 'pointer', touchAction: 'manipulation' }}
                >
                  Herramientas
                  <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {/* Invisible bridge to prevent gap between button and dropdown */}
                <div className="absolute top-full left-0 w-full h-3" />
                <div className="absolute top-[calc(100%+4px)] left-0 w-[420px] lg:w-[500px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0">
                  <glass-element auto-size="true" radius="16" no-border="true" depth="2" blur="8" strength="15" background-color="rgba(11, 15, 25, 0.95)" chromatic-aberration="1" style={{ '--glass-padding': '0' }}>
                    <div className="p-4 grid grid-cols-2 gap-2">
                      {TOOLS.map((tool) => (
                        <Link key={tool.label} to={tool.to} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
                          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{tool.icon}</svg>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white mb-0.5">{tool.label}</span>
                            <span className="text-xs text-[#CBCDD3] leading-tight">{tool.desc}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </glass-element>
                </div>
              </div>
            </div>

            {/* RIGHT: Login + Mobile hamburger */}
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className={`text-sm font-medium transition ${location.pathname === '/login' ? 'text-[#CBCDD3]' : 'text-[#CBCDD3]/80 hover:text-white'}`}
                style={{ padding: '10px 12px', minHeight: '44px', display: 'flex', alignItems: 'center', touchAction: 'manipulation', cursor: 'pointer' }}
              >
                Login
              </Link>

              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMobileOpen(o => !o)}
                aria-label="Abrir menú"
                className="md:hidden flex flex-col justify-center items-center rounded-lg border border-[#2F4A67]/50 bg-[#0F2C45]/30 hover:bg-[#2F4A67]/30 transition gap-1.5 p-2"
                style={{ minWidth: '44px', minHeight: '44px', touchAction: 'manipulation', cursor: 'pointer' }}
              >
                <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-full h-0.5 bg-white rounded transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </button>
            </div>
          </div>
        </glass-element>
      </nav>

      {/* ===== MOBILE DRAWER OVERLAY ===== */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" aria-hidden="true" />
      )}

      {/* ===== MOBILE DRAWER ===== */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 md:hidden transform transition-transform duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full bg-[#0b0f19]/95 backdrop-blur-xl border-l border-[#2F4A67]/40 flex flex-col">

          {/* Drawer header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2F4A67]/30">
            <span className="text-white font-bold text-base">Menú</span>
            <button
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center rounded-lg border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 transition"
              style={{ minWidth: '44px', minHeight: '44px', touchAction: 'manipulation', cursor: 'pointer' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Accordion sections */}
          <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
            {NAV_SECTIONS.map((section) => {
              const isOpen = openSection === section.id;
              return (
                <div key={section.id} className="rounded-xl overflow-hidden">
                  {/* Section header / trigger */}
                  <button
                    onClick={() => setOpenSection(isOpen ? null : section.id)}
                    className="w-full flex items-center justify-between px-4 rounded-xl hover:bg-[#2F4A67]/15 active:bg-[#2F4A67]/25 transition group"
                    style={{ minHeight: '52px', touchAction: 'manipulation', cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2F4A67]/60 bg-[#0F2C45]/40 text-white group-hover:border-[#2F4A67] transition flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{section.icon}</svg>
                      </div>
                      <span className="text-sm font-semibold text-white">{section.label}</span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-[#CBCDD3] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Sub-items (accordion body) */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pl-3 pr-1 pb-2 pt-1 space-y-0.5">
                      {section.items.map((item) => (
                        <Link
                          key={item.label}
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
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

          {/* Drawer footer */}
          <div className="px-5 py-5 border-t border-[#2F4A67]/30">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center py-3 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 rounded-xl transition text-sm font-medium"
            >
              Login
            </Link>
          </div>
        </div>
      </div>

      {/* ===== PAGES ===== */}
      <div className="pt-14 min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/deploy" element={<Deploy />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
