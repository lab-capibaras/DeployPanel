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
            <Link to="/" className="text-2xl font-bold text-white hover:text-[#CBCDD3] flex items-center gap-3 group">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
              </svg>
              StarDest
            </Link>
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
              <glass-element auto-size="true" radius="8" no-border="true" depth="2" blur="1" strength="15" background-color={location.pathname === '/deploy' ? 'rgba(15, 44, 69, 0.9)' : 'rgba(47, 74, 103, 0.7)'} chromatic-aberration="1" style={{ "--glass-padding": "0" }}>
                <Link
                  to="/deploy"
                  className="block px-4 py-2 font-medium text-white transition rounded-lg"
                >
                  Deploy
                </Link>
              </glass-element>
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
