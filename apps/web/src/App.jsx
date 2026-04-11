import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Deploy from './pages/Deploy';

function App() {
  const location = useLocation();

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 w-full z-50 border-b border-[#2F4A67]/40 shadow-lg">
        <glass-element className="w-full block" full-width="true" auto-size="true" radius="0" no-border="true" depth="2" blur="3" strength="20" background-color="rgba(11, 15, 25, 0.7)" chromatic-aberration="1" style={{ "--glass-padding": "0" }}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center w-full">
            <div className="flex items-center gap-8">
              <Link to="/" className="text-2xl font-bold text-white hover:text-[#CBCDD3] flex items-center gap-3 group">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                </svg>
                StarDest
              </Link>

              {/* Dropdown Herramientas */}
              <div className="relative group hidden md:block">
                <button className="flex items-center gap-1 text-sm font-medium text-[#CBCDD3]/80 hover:text-white transition py-4">
                  Herramientas
                  <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-14 left-0 mt-2 w-[400px] lg:w-[500px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0">
                  <glass-element auto-size="true" radius="16" no-border="true" depth="2" blur="8" strength="15" background-color="rgba(11, 15, 25, 0.95)" chromatic-aberration="1" style={{ "--glass-padding": "0" }}>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      
                      {/* Despliegue Item */}
                      <Link to="/deploy" className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white mb-0.5">Despliegue</span>
                          <span className="text-xs text-[#CBCDD3] leading-tight">Despliega tu código en segundos</span>
                        </div>
                      </Link>

                      {/* Pizarra Item */}
                      <Link to="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white mb-0.5">Pizarra</span>
                          <span className="text-xs text-[#CBCDD3] leading-tight">Diseña tu arquitectura visualmente</span>
                        </div>
                      </Link>

                      {/* Monitoreo Item */}
                      <Link to="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white mb-0.5">Monitoreo</span>
                          <span className="text-xs text-[#CBCDD3] leading-tight">Métricas de CPU en tiempo real</span>
                        </div>
                      </Link>

                      {/* Dominios Item */}
                      <Link to="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2F4A67]/20 transition group/item">
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[#2F4A67] bg-[#0F2C45]/50 text-white group-hover/item:border-white/40 group-hover/item:shadow-[0_0_15px_rgba(47,74,103,0.5)] transition">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white mb-0.5">Dominios</span>
                          <span className="text-xs text-[#CBCDD3] leading-tight">Configura URLs y certificados</span>
                        </div>
                      </Link>

                    </div>
                  </glass-element>
                </div>
              </div>
            </div>
            <div className="flex gap-4 sm:gap-6 items-center">
              <Link
                to="/"
                className={`text-sm sm:text-base font-medium transition ${location.pathname === '/' ? 'text-[#CBCDD3]' : 'text-[#CBCDD3]/80 hover:text-white'}`}
              >
                Inicio
              </Link>
              <Link
                to="/login"
                className={`text-sm sm:text-base font-medium transition ${location.pathname === '/login' ? 'text-[#CBCDD3]' : 'text-[#CBCDD3]/80 hover:text-white'}`}
              >
                Login
              </Link>
            </div>
          </div>
        </glass-element>
      </nav>
      <div className="pt-16 min-h-screen">
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
