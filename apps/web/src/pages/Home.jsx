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
      
        {/* HERO SECTION */}
        <section className="relative pt-32 sm:pt-40 pb-20 px-4 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#2F4A67]/20 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="relative max-w-7xl mx-auto flex flex-col items-center text-center">
            
            <div className="inline-flex items-center space-x-3 mb-8 px-5 py-2 bg-[#0F2C45]/30 border border-[#2F4A67]/50 rounded-full shadow-[0_0_15px_rgba(47,74,103,0.3)]">
              <span className="flex w-2.5 h-2.5 rounded-full bg-[#60A5FA] animate-pulse"></span>
              <span className="text-[#CBCDD3] text-sm font-medium tracking-wide">Plataforma de Despliegue Avanzada</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-[#CBCDD3] mb-8 leading-tight tracking-tight">
              Escala sin <br className="hidden sm:block"/>
              <span className="bg-clip-text bg-gradient-to-r from-[#60A5FA] via-[#3B82F6] to-[#2F4A67]">
                límites
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-[#CBCDD3] max-w-3xl mx-auto font-light leading-relaxed mb-12">
              Arquitectura en la nube automatizada. Integra tu repositorio, orquesta tus entornos y despliega infraestructura global con zero-downtime.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto justify-center">
              <Link
                to="/deploy"
                className="group relative px-8 py-4 bg-[#0F2C45] hover:bg-[#1a3855] border border-[#2F4A67] text-white font-semibold rounded-xl transition duration-300 shadow-[0_0_30px_rgba(15,44,69,0.5)] hover:shadow-[0_0_40px_rgba(47,74,103,0.6)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <span className="relative flex items-center justify-center">
                  Comenzar Despliegue
                  <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                  </svg>
                </span>
              </Link>
              
              <a
                href="#bento"
                className="px-8 py-4 bg-transparent border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 font-medium rounded-xl transition duration-300"
              >
                Explorar Arquitectura
              </a>
            </div>
          </div>
        </section>

        {/* METRICS SHOWCASE */}
        <section className="py-12 border-y border-[#2F4A67]/20 bg-[#0F2C45]/10 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-[#2F4A67]/20">
              <div className="flex flex-col">
                <span className="text-4xl font-black text-white mb-2">99.99%</span>
                <span className="text-xs font-semibold tracking-wider text-[#2F4A67] uppercase">SLA Garantizado</span>
              </div>
              <div className="flex flex-col">
                <span className="text-4xl font-black text-white mb-2">&lt; 10ms</span>
                <span className="text-xs font-semibold tracking-wider text-[#2F4A67] uppercase">Latencia Global</span>
              </div>
              <div className="flex flex-col">
                <span className="text-4xl font-black text-white mb-2">3 M+</span>
                <span className="text-xs font-semibold tracking-wider text-[#2F4A67] uppercase">Deployments</span>
              </div>
              <div className="flex flex-col">
                <span className="text-4xl font-black text-white mb-2">Zero</span>
                <span className="text-xs font-semibold tracking-wider text-[#2F4A67] uppercase">Configuración Manual</span>
              </div>
            </div>
          </div>
        </section>

        {/* BENTO BOX FEATURES */}
        <section id="bento" className="py-32 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6 tracking-tight">
                Infraestructura como Experiencia
              </h2>
              <p className="text-[#CBCDD3] text-lg max-w-2xl mx-auto">
                No lidies con servidores. Hemos abstraído la complejidad operativa para que te enfoques exclusivamente en enviar código.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-max">
              {/* Main Large Card */}
              <div className="md:col-span-2 group">
                <glass-element className="h-full block overflow-hidden relative" auto-size="true" radius="24" no-border="true" depth="4" blur="4" strength="30" background-color="rgba(15, 44, 69, 0.4)" chromatic-aberration="1" style={{ "--glass-padding": "2.5rem" }}>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#3B82F6]/10 blur-[80px] rounded-full group-hover:bg-[#3B82F6]/20 transition duration-700 pointer-events-none"></div>
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="mb-10">
                      <div className="w-14 h-14 rounded-xl bg-[#0F2C45] border border-[#2F4A67] flex items-center justify-center mb-6 shadow-inner">
                        <svg className="w-7 h-7 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                        </svg>
                      </div>
                      <h3 className="text-3xl font-bold text-white mb-4">Pipeline de Despliegue Inmutable</h3>
                      <p className="text-[#CBCDD3] max-w-lg leading-relaxed text-lg">
                        Cada commit o cambio genera un build inmutable. Despliega versiones seguras, revierte de forma instántanea y asegura que la paridad entre entornos sea matemática.
                      </p>
                    </div>
                    
                    <div className="bg-[#0b0f19]/90 border border-[#2F4A67]/60 rounded-xl p-5 font-mono text-sm shadow-2xl relative">
                       <div className="flex gap-2 mb-4 border-b border-[#2F4A67]/40 pb-3">
                         <div className="w-3.5 h-3.5 rounded-full bg-[#2F4A67]"></div>
                         <div className="w-3.5 h-3.5 rounded-full bg-[#2F4A67]"></div>
                         <div className="w-3.5 h-3.5 rounded-full bg-[#2F4A67]"></div>
                       </div>
                       <div className="text-[#CBCDD3] space-y-3 opacity-90 text-[15px]">
                         <p><span className="text-[#60A5FA]">~</span> $ stardest deploy main</p>
                         <p className="text-[#2F4A67] pl-2">» Analyzing repository structure</p>
                         <p className="text-[#2F4A67] pl-2">» Provisioning isolated container</p>
                         <p className="text-white pl-2">✓ Build successfully compiled in 1.2s</p>
                         <p className="text-[#60A5FA] font-bold pl-2 mt-2">✓ Live at prod-489x.stardest.app</p>
                       </div>
                    </div>
                  </div>
                </glass-element>
              </div>

              {/* Side Small Card */}
              <div className="md:col-span-1 group">
                <glass-element className="h-full block" auto-size="true" radius="24" no-border="true" depth="4" blur="4" strength="30" background-color="rgba(15, 44, 69, 0.4)" chromatic-aberration="1" style={{ "--glass-padding": "2.5rem" }}>
                  <div className="flex flex-col h-full">
                    <div className="w-14 h-14 rounded-xl bg-[#0F2C45] border border-[#2F4A67] flex items-center justify-center mb-6">
                       <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                       </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">Red Distribuida Segura</h3>
                    <p className="text-[#CBCDD3] leading-relaxed text-lg">
                      Protección contra ataques DDOS nativa. Los certificados TLS se aprovisionan y renuevan en segundo plano automáticamente y sin costo.
                    </p>
                  </div>
                </glass-element>
              </div>

              {/* Bottom Small Card */}
              <div className="md:col-span-1 group">
                 <glass-element className="h-full block" auto-size="true" radius="24" no-border="true" depth="4" blur="4" strength="30" background-color="rgba(15, 44, 69, 0.4)" chromatic-aberration="1" style={{ "--glass-padding": "2.5rem" }}>
                  <div className="flex flex-col h-full">
                    <div className="w-14 h-14 rounded-xl bg-[#0F2C45] border border-[#2F4A67] flex items-center justify-center mb-6">
                       <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                       </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">Enrutamiento DNS Global</h3>
                    <p className="text-[#CBCDD3] leading-relaxed text-lg">
                      Borde distribuido que acerca el cómputo y el enrutamiento a tus clientes finales, disminuyendo saltos y latencia drásticamente.
                    </p>
                  </div>
                </glass-element>
              </div>

              {/* Bottom Wide Card */}
              <div className="md:col-span-2 group">
                 <glass-element className="h-full block" auto-size="true" radius="24" no-border="true" depth="4" blur="4" strength="30" background-color="rgba(15, 44, 69, 0.4)" chromatic-aberration="1" style={{ "--glass-padding": "2.5rem" }}>
                  <div className="flex flex-col md:flex-row gap-10 items-center h-full">
                    <div className="flex-1">
                      <div className="w-14 h-14 rounded-xl bg-[#0F2C45] border border-[#2F4A67] flex items-center justify-center mb-6">
                         <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                         </svg>
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-4">Observabilidad Transparente</h3>
                      <p className="text-[#CBCDD3] leading-relaxed text-lg">
                        Audita métricas vitales operacionales. Telemetría lista para usarse que monitoriza cuellos de botella en memoria, carga de CPU y banda ancha de red.
                      </p>
                    </div>
                    {/* Mock Graph or Lines */}
                    <div className="flex-shrink-0 w-full md:w-72 h-40 relative flex items-end justify-between border-b-2 border-[#2F4A67] pb-2 px-2">
                       <div className="w-[12%] bg-[#2F4A67]/80 h-[30%] rounded-t-md group-hover:h-[50%] transition-all duration-700 ease-in-out"></div>
                       <div className="w-[12%] bg-[#2F4A67]/80 h-[60%] rounded-t-md group-hover:h-[40%] transition-all duration-700 ease-in-out"></div>
                       <div className="w-[12%] bg-[#3B82F6] h-[40%] rounded-t-md group-hover:h-[90%] transition-all duration-700 ease-in-out shadow-[0_0_15px_#3B82F6]"></div>
                       <div className="w-[12%] bg-[#2F4A67]/80 h-[80%] rounded-t-md group-hover:h-[60%] transition-all duration-700 ease-in-out"></div>
                       <div className="w-[12%] bg-[#2F4A67]/80 h-[50%] rounded-t-md group-hover:h-[80%] transition-all duration-700 ease-in-out"></div>
                    </div>
                  </div>
                </glass-element>
              </div>
            </div>
          </div>
        </section>

        {/* WORKFLOW TIMELINE */}
        <section className="py-32 px-4 relative overflow-hidden">
          <div className="max-w-4xl mx-auto relative z-10">
            <div className="text-center mb-24">
               <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">Arquitectura de Cero a Cien</h2>
               <p className="text-[#CBCDD3] text-xl">El ciclo de vida de tu aplicación simplificado arquitectónicamente.</p>
            </div>

            <div className="relative border-l border-[#2F4A67] ml-8 md:ml-0 md:border-none space-y-16">
               
               <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-[#2F4A67] via-[#3B82F6] to-[#0b0f19] -translate-x-1/2 -z-10"></div>

               {/* Step 1 */}
               <div className="relative flex flex-col md:flex-row items-start md:items-center">
                 <div className="hidden md:flex w-1/2 justify-end pr-12 text-right">
                    <div className="max-w-sm">
                      <h4 className="text-2xl font-bold text-white">1. Integración de Código</h4>
                      <p className="text-[#CBCDD3] mt-3 text-lg">Escuchamos cada evento de tu repositorio vinculado de forma determinista.</p>
                    </div>
                 </div>
                 <div className="absolute left-[-32px] md:relative md:left-auto w-16 h-16 bg-[#0b0f19] border-2 border-[#2F4A67] rounded-full flex items-center justify-center font-bold text-xl text-white z-10 shadow-[0_0_20px_rgba(47,74,103,0.8)]">1</div>
                 <div className="pl-12 md:pl-12 md:w-1/2 md:hidden">
                    <h4 className="text-2xl font-bold text-white">1. Integración de Código</h4>
                    <p className="text-[#CBCDD3] mt-3 text-lg">Escuchamos cada evento de tu repositorio vinculado de forma determinista.</p>
                 </div>
               </div>

               {/* Step 2 */}
               <div className="relative flex flex-col md:flex-row items-start md:items-center">
                 <div className="hidden md:flex w-1/2 pr-12"></div>
                 <div className="absolute left-[-32px] md:relative md:left-auto w-16 h-16 bg-[#0b0f19] border-2 border-[#2F4A67] rounded-full flex items-center justify-center font-bold text-xl text-white z-10 shadow-[0_0_20px_rgba(47,74,103,0.8)]">2</div>
                 <div className="pl-12 md:pl-12 md:w-1/2">
                    <div className="max-w-sm">
                      <h4 className="text-2xl font-bold text-white">2. Orquestación del Entorno</h4>
                      <p className="text-[#CBCDD3] mt-3 text-lg">Detectamos la base de código y la encapsulamos en un contenedor de sistema inmutable y sellado.</p>
                    </div>
                 </div>
               </div>

               {/* Step 3 */}
               <div className="relative flex flex-col md:flex-row items-start md:items-center">
                 <div className="hidden md:flex w-1/2 justify-end pr-12 text-right">
                    <div className="max-w-sm">
                      <h4 className="text-2xl font-bold text-white">3. Publicación de Nodos</h4>
                      <p className="text-[#CBCDD3] mt-3 text-lg">La red de distribución expone tu servicio de forma balanceada alrededor del mundo.</p>
                    </div>
                 </div>
                 <div className="absolute left-[-32px] md:relative md:left-auto w-16 h-16 bg-[#0F2C45] border-2 border-[#60A5FA] rounded-full flex items-center justify-center font-bold text-xl text-white z-10 shadow-[0_0_25px_rgba(59,130,246,0.5)]">3</div>
                 <div className="pl-12 md:pl-12 md:w-1/2 md:hidden">
                    <h4 className="text-2xl font-bold text-white">3. Publicación de Nodos</h4>
                    <p className="text-[#CBCDD3] mt-3 text-lg">La red de distribución expone tu servicio de forma balanceada alrededor del mundo.</p>
                 </div>
               </div>

            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 px-4 overflow-hidden relative">
          <div className="max-w-5xl mx-auto text-center relative z-10 hover:scale-[1.01] transition duration-500">
            <glass-element className="block" auto-size="true" radius="32" no-border="true" depth="6" blur="8" strength="15" background-color="rgba(15, 44, 69, 0.4)" chromatic-aberration="1" style={{ "--glass-padding": "6rem 2rem" }}>
               <h2 className="text-4xl sm:text-6xl font-black text-white mb-8 tracking-tight">El Futuro de la Infraestructura</h2>
               <p className="text-xl sm:text-2xl text-[#CBCDD3] mb-12 max-w-3xl mx-auto font-light leading-relaxed">
                 Deja de operar infraestructura y manejar escalamiento complejo. Comienza a implementar experiencias sólidas desde hoy.
               </p>
               <Link
                 to="/deploy"
                 className="inline-flex px-12 py-5 bg-white text-[#0b0f19] hover:bg-[#e2e8f0] font-black rounded-xl transition duration-300 transform shadow-[0_10px_40px_rgba(255,255,255,0.15)] text-lg"
               >
                 Inicia un Despliegue Configurado
               </Link>
            </glass-element>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-[#2F4A67]/30 pt-20 pb-12 px-6 bg-[#040812]">
          <div className="max-w-7xl mx-auto">
            <div className="grid sm:grid-cols-2 ml-4 md:ml-0 lg:grid-cols-4 gap-12 mb-20">
              <div>
                <h4 className="text-white font-bold mb-6 tracking-wider uppercase text-sm">Plataforma</h4>
                <ul className="space-y-4">
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Arquitectura Central</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Red de Distribución</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Orquestación Avanzada</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6 tracking-wider uppercase text-sm">Desarrollo</h4>
                <ul className="space-y-4">
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Documentación Técnica</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Guías y Patrones</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Registros de API</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6 tracking-wider uppercase text-sm">Organización</h4>
                <ul className="space-y-4">
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Equipo Institucional</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Carreras Profesionales</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Sala de Noticias</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6 tracking-wider uppercase text-sm">Normativa</h4>
                <ul className="space-y-4">
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Avisos y Contratos</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Privacidad Corporativa</a></li>
                  <li><a href="#" className="text-[#CBCDD3]/80 hover:text-white transition">Auditorías de Seguridad</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-[#2F4A67]/30 pt-8 flex flex-col md:flex-row justify-between items-center text-[#CBCDD3]/60 text-sm">
              <p className="mb-4 md:mb-0">
                © 2026 StarDest Cloud Operations.
              </p>
              <div className="flex space-x-8">
                <a href="#" className="hover:text-white transition">Estado del Sistema</a>
                <a href="#" className="hover:text-white transition">Acuerdos de Nivel de Servicio</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
