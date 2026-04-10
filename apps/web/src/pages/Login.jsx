import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Starfield from '../components/Starfield';

function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Simular login
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="relative min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
      <Starfield />
      <div className="relative w-full max-w-md z-10">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-2 mb-6">
            <glass-element width="48" height="48" radius="8" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)">
              <span className="text-white font-bold text-2xl">S</span>
            </glass-element>
            <span className="text-white font-bold text-2xl">StarDest</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Bienvenido</h1>
          <p className="text-[#CBCDD3]">Inicia sesión en tu cuenta</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#0f172a]/60 backdrop-blur-md rounded-2xl border border-[#2F4A67]/30 p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#CBCDD3] mb-2">
                Correo Electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-[#0b0f19]/50 border border-[#2F4A67]/30 rounded-lg text-white placeholder-[#CBCDD3]/50 focus:outline-none focus:ring-2 focus:ring-[#0F2C45] focus:border-transparent transition duration-200"
                placeholder="tu@email.com"
              />
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-[#CBCDD3]">
                  Contraseña
                </label>
                <a href="#" className="text-sm text-[#0F2C45] hover:text-[#2F4A67] transition">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-[#0b0f19]/50 border border-[#2F4A67]/30 rounded-lg text-white placeholder-[#CBCDD3]/50 focus:outline-none focus:ring-2 focus:ring-[#0F2C45] focus:border-transparent transition duration-200"
                placeholder="••••••••"
              />
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                id="remember"
                type="checkbox"
                className="w-4 h-4 rounded border-[#2F4A67]/30 bg-[#0b0f19]/50 text-[#0F2C45] focus:ring-[#0F2C45] focus:ring-offset-0"
              />
              <label htmlFor="remember" className="ml-2 block text-sm text-[#CBCDD3]">
                Recordarme
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#0F2C45] to-[#0E2C45] hover:from-[#2F4A67] hover:to-[#0F2C45] text-white font-bold py-3 px-6 rounded-lg transition duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Iniciando sesión...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2F4A67]/30"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#0b0f19] text-[#CBCDD3]">O continúa con</span>
            </div>
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              className="flex items-center justify-center px-4 py-3 border border-[#2F4A67]/30 rounded-lg hover:bg-[#0b0f19]/50 transition text-white font-medium"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </button>
            <button
              type="button"
              className="flex items-center justify-center px-4 py-3 border border-[#2F4A67]/30 rounded-lg hover:bg-[#0b0f19]/50 transition text-white font-medium"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
          </div>
        </div>

        {/* Sign Up Link */}
        <p className="text-center mt-6 text-[#CBCDD3]">
          ¿No tienes una cuenta?{' '}
          <a href="#" className="text-[#0F2C45] hover:text-[#2F4A67] font-medium transition">
            Regístrate
          </a>
        </p>

        {/* Back to Home */}
        <div className="text-center mt-4">
          <Link to="/" className="text-sm text-[#CBCDD3] hover:text-white transition inline-flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
