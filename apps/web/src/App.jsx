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
                <button className="flex items-center gap-1 text-sm font-medium text-[#CBCDD3]/80 hover:text-white transition py-2">
                  Herramientas
                  <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full left-0 mt-1 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0">
                  <glass-element auto-size="true" radius="8" no-border="true" depth="2" blur="2" strength="20" background-color="rgba(11, 15, 25, 0.95)" chromatic-aberration="1" style={{ "--glass-padding": "0" }}>
                    <div className="py-2 flex flex-col">
                      <Link to="/deploy" className="px-4 py-2 text-sm text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/30 transition">Despliegue</Link>
                      <Link to="#" className="px-4 py-2 text-sm text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/30 transition">Pizarra</Link>
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
