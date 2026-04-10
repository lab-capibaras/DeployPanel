import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Starfield from '../components/Starfield';

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0b0f19]">
      <Starfield />
      <div className="relative z-10 font-sans">

        {/* Hero Section */}
        <section className="relative pt-16 sm:pt-24 pb-16 px-4 overflow-hidden">

          <div className="relative max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left content */}
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center space-x-2 mb-4 px-4 py-2 bg-[#0F2C45]/20 border border-[#0F2C45] rounded-full">
                  <svg className="w-4 h-4 text-[#CBCDD3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-[#CBCDD3] text-xs sm:text-sm font-medium">Despliegue en segundos</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-tight">
                  Despliega tu
                  <span className="block bg-gradient-to-r from-[#0F2C45] to-[#2F4A67] bg-clip-text text-transparent">
                    Aplicación
                  </span>
                  al instante
                </h1>

                <p className="text-lg sm:text-xl text-[#CBCDD3] mb-8 max-w-2xl mx-auto lg:mx-0">
                  Plataforma automática de despliegue. Conecta tu repositorio y despliega en producción sin configuración compleja.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <Link
                    to="/deploy"
                    className="group px-8 py-4 bg-gradient-to-r from-[#0F2C45] to-[#0E2C45] hover:from-[#2F4A67] hover:to-[#0F2C45] text-white font-bold rounded-lg transition transform hover:scale-105 shadow-lg hover:shadow-[#0F2C45]/50"
                  >
                    <span className="flex items-center justify-center">
                      Comenzar Ahora
                      <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                      </svg>
                    </span>
                  </Link>

                  <a
                    href="#features"
                    className="px-8 py-4 border-2 border-[#2F4A67] text-white hover:bg-[#2F4A67]/10 font-medium rounded-lg transition"
                  >
                    Ver Características
                  </a>
                </div>

                {/* Stats */}
                <div className="mt-12 grid grid-cols-3 gap-4 sm:gap-8">
                  <div className="text-center lg:text-left">
                    <div className="text-2xl sm:text-3xl font-bold text-white">5min</div>
                    <div className="text-xs sm:text-sm text-[#CBCDD3]">Tiempo promedio</div>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="text-2xl sm:text-3xl font-bold text-white">99.9%</div>
                    <div className="text-xs sm:text-sm text-[#CBCDD3]">Uptime</div>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="text-2xl sm:text-3xl font-bold text-white">24/7</div>
                    <div className="text-xs sm:text-sm text-[#CBCDD3]">Soporte</div>
                  </div>
                </div>
              </div>

              {/* Right visual */}
              <div className="relative hidden lg:block hover:transform hover:scale-105 transition duration-500">
                <div className="relative bg-gradient-to-br from-[#0F2C45]/30 to-[#2F4A67]/30 backdrop-blur-xl border border-[#2F4A67]/40 rounded-2xl p-8 shadow-2xl">
                  {/* Background removed to prioritize space aesthetic */}

                  <div className="relative space-y-4">
                    {/* Code editor mockup */}
                    <div className="bg-[#040812]/30 backdrop-blur-md rounded-lg p-4 border border-[#2F4A67]/30">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="space-y-2 font-mono text-sm">
                        <div className="text-[#CBCDD3]">$ git push origin main</div>
                        <div className="text-green-400">✓ Build successful</div>
                        <div className="text-blue-400">→ Deploying...</div>
                        <div className="text-green-400">✓ Live at yourapp.stardest.com</div>
                      </div>
                    </div>

                    {/* Deployment cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#040812]/30 backdrop-blur-md rounded-lg p-4 border border-[#2F4A67]/30 hover:bg-[#040812]/50 transition cursor-default">
                        <div className="text-[#CBCDD3] text-sm mb-1">Entorno</div>
                        <div className="text-white font-bold">Instanciado</div>
                      </div>
                      <div className="bg-[#040812]/30 backdrop-blur-md rounded-lg p-4 border border-[#2F4A67]/30 hover:bg-[#040812]/50 transition cursor-default">
                        <div className="text-[#CBCDD3] text-sm mb-1">Seguridad</div>
                        <div className="text-white font-bold">Activa</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 sm:py-24 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                Todo lo que necesitas
              </h2>
              <p className="text-lg sm:text-xl text-[#CBCDD3] max-w-2xl mx-auto">
                Herramientas profesionales para equipos modernos
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* Feature 1 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Ultra Rápido</h3>
                <p className="text-[#CBCDD3]">
                  Despliega en menos de 5 minutos. Pipeline de despliegue optimizado para velocidad.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Contenedores Aislados</h3>
                <p className="text-[#CBCDD3]">
                  Entornos empaquetados para asegurar consistencia total entre desarrollo y producción.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Seguridad Integrada</h3>
                <p className="text-[#CBCDD3]">
                  Certificados seguros generados automáticamente para proteger tus aplicaciones.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Subdominios</h3>
                <p className="text-[#CBCDD3]">
                  Tu app en yourname.stardest.com lista para recibir tráfico en segundos.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Monitoreo</h3>
                <p className="text-[#CBCDD3]">
                  Dashboard en tiempo real con métricas de CPU, memoria y estado de salud.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="group bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 hover:border-[#2F4A67] transition-all hover:transform hover:scale-105">
                <glass-element width="56" height="56" radius="12" depth="4" blur="2" strength="30" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-4 sm:mb-6 group-hover:scale-110 transition-transform inline-block">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </glass-element>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Auto Deploy</h3>
                <p className="text-[#CBCDD3]">
                  Push a tu rama y observa cómo se despliega automáticamente. CI/CD integrado.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 sm:py-24 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                Tres pasos simples
              </h2>
              <p className="text-lg sm:text-xl text-[#CBCDD3]">
                De código a producción en minutos
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 relative">
              {/* Connecting line - hidden on mobile */}
              <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0F2C45] via-[#2F4A67] to-[#0F2C45] opacity-30"></div>

              {/* Step 1 */}
              <div className="relative">
                <div className="bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 text-center lg:text-left">
                  <glass-element width="64" height="64" radius="32" depth="5" blur="2" strength="40" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-6 mx-auto lg:mx-0 relative z-10 inline-block">
                    <span className="text-white text-2xl font-bold">1</span>
                  </glass-element>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 text-center lg:text-left">
                    Conecta tu Repositorio
                  </h3>
                  <p className="text-[#CBCDD3] text-center lg:text-left">
                    Pega la URL de tu repositorio y selecciona la rama que quieres desplegar.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 text-center lg:text-left">
                  <glass-element width="64" height="64" radius="32" depth="5" blur="2" strength="40" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-6 mx-auto lg:mx-0 relative z-10 inline-block">
                    <span className="text-white text-2xl font-bold">2</span>
                  </glass-element>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 text-center lg:text-left">
                    Elige Subdominio
                  </h3>
                  <p className="text-[#CBCDD3] text-center lg:text-left">
                    Selecciona un nombre único para tu aplicación en stardest.com
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="bg-[#0f172a]/60 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-[#2F4A67]/20 text-center lg:text-left">
                  <glass-element width="64" height="64" radius="32" depth="5" blur="2" strength="40" background-color="rgba(15, 44, 69, 0.5)" chromatic-aberration="1" class="mb-6 mx-auto lg:mx-0 relative z-10 inline-block">
                    <span className="text-white text-2xl font-bold">3</span>
                  </glass-element>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 text-center lg:text-left">
                    Deploy
                  </h3>
                  <p className="text-[#CBCDD3] text-center lg:text-left">
                    Observa el proceso en tiempo real: clone → build → deploy. ¡Listo!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4">
          <div className="max-w-4xl mx-auto hover:transform hover:scale-[1.02] transition duration-500">
            <div className="relative bg-gradient-to-br from-[#0F2C45]/30 to-[#2F4A67]/30 backdrop-blur-xl border border-[#2F4A67]/40 rounded-3xl p-8 sm:p-12 lg:p-16 overflow-hidden shadow-2xl shadow-[#0F2C45]/20">
              {/* Minimalist modern CTA panel */}

              <div className="relative text-center">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                  ¿Listo para desplegar?
                </h2>
                <p className="text-lg sm:text-xl text-white/80 mb-8 max-w-2xl mx-auto">
                  Únete a cientos de desarrolladores que ya están desplegando sus aplicaciones con StarDest.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    to="/deploy"
                    className="px-8 py-4 bg-white text-[#0F2C45] font-bold rounded-lg hover:bg-gray-100 transition transform hover:scale-105 shadow-xl"
                  >
                    Comenzar Gratis
                  </Link>
                  <a
                    href="https://docs.stardest.com"
                    className="px-8 py-4 border-2 border-white text-white hover:bg-white/10 font-medium rounded-lg transition"
                  >
                    Ver Documentación
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#2F4A67]/20 py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
              <div>
                <h4 className="text-white font-bold mb-4">Producto</h4>
                <ul className="space-y-2">
                  <li><a href="#features" className="text-[#CBCDD3] hover:text-white transition">Características</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Precios</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Roadmap</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-4">Recursos</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Documentación</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">API</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Tutoriales</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-4">Compañía</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Sobre Nosotros</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Blog</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Contacto</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-4">Legal</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Privacidad</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Términos</a></li>
                  <li><a href="#" className="text-[#CBCDD3] hover:text-white transition">Seguridad</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-[#2F4A67]/20 pt-8 text-center">
              <p className="text-[#CBCDD3]">
                © 2025 StarDest. Plataforma de despliegue automatizado.
                by Angel Corona.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
