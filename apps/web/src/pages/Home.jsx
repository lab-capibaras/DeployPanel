import React from 'react';
import { Link } from 'react-router-dom';
import Starfield from '../components/Starfield';
import { useTranslation } from '../i18n';

export default function Home() {
  const t = useTranslation();
  const h = t.home;

  return (
    <div className="relative min-h-screen bg-[#0b0f19] overflow-x-hidden">
      <Starfield />
      <div className="relative z-10 font-sans">

        {/* ============ HERO ============ */}
        <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 px-5 sm:px-6 flex flex-col items-center text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[700px] h-[340px] sm:h-[700px] bg-[#1e3a5f]/25 blur-[80px] sm:blur-[130px] rounded-full pointer-events-none" />

          <div className="inline-flex items-center gap-2 mb-7 sm:mb-10 px-4 py-2 sm:px-5 sm:py-2.5 bg-[#0F2C45]/40 border border-[#2F4A67]/60 rounded-full">
            <span className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
            <span className="text-[#CBCDD3] text-xs sm:text-sm font-medium tracking-wide">{h.badge}</span>
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-6 sm:mb-8 leading-none">
            <span className="text-white">{h.h1_1}</span>
            <br />
            <span className="bg-gradient-to-r from-[#60A5FA] via-[#3B82F6] to-[#a5c8ff] bg-clip-text text-transparent">
              {h.h1_2}
            </span>
          </h1>

          <p className="text-base sm:text-xl md:text-2xl text-[#CBCDD3] max-w-2xl leading-relaxed mb-10 sm:mb-14 font-light">
            {h.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link
              to="/deploy"
              className="w-full sm:w-auto px-7 sm:px-9 py-3.5 sm:py-4 bg-[#0F2C45] hover:bg-[#1a3f5e] border border-[#2F4A67] hover:border-[#60A5FA]/50 text-white font-semibold rounded-xl transition-all duration-300 shadow-[0_0_30px_rgba(15,44,69,0.6)] hover:shadow-[0_0_45px_rgba(47,74,103,0.7)] flex items-center justify-center gap-2 group"
            >
              {h.cta_start}
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto px-7 sm:px-9 py-3.5 sm:py-4 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 font-medium rounded-xl transition-all duration-300 text-center"
            >
              {h.cta_explore}
            </a>
          </div>
        </section>

        {/* ============ METRICS STRIP ============ */}
        <div className="border-y border-[#2F4A67]/25 bg-[#0F2C45]/15 py-8 sm:py-10 px-5 sm:px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
            {h.metrics.map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 sm:gap-2">
                <span className="text-2xl sm:text-3xl md:text-4xl font-black text-white">{val}</span>
                <span className="text-[10px] sm:text-xs font-semibold tracking-widest text-[#2F4A67] uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ============ BENTO FEATURES ============ */}
        <section id="features" className="py-20 sm:py-28 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-20">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-5 tracking-tight">
                {h.features_title}
              </h2>
              <p className="text-[#CBCDD3] text-base sm:text-lg max-w-xl mx-auto">{h.features_sub}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

              {/* Big card — Pipeline */}
              <div className="md:col-span-2 rounded-2xl bg-[#0F2C45]/40 border border-[#2F4A67]/50 p-8 hover:border-[#2F4A67] transition-all duration-500 group">
                <div className="w-12 h-12 rounded-xl bg-[#0b0f19] border border-[#2F4A67] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">{h.cards[0].title}</h3>
                <p className="text-[#CBCDD3] leading-relaxed mb-8">{h.cards[0].desc}</p>
                <div className="bg-[#0b0f19]/90 border border-[#2F4A67]/50 rounded-xl p-5 font-mono text-sm">
                  <div className="flex gap-2 mb-4 border-b border-[#2F4A67]/30 pb-3">
                    <div className="w-3 h-3 rounded-full bg-[#2F4A67]" />
                    <div className="w-3 h-3 rounded-full bg-[#2F4A67]" />
                    <div className="w-3 h-3 rounded-full bg-[#2F4A67]" />
                  </div>
                  <div className="space-y-2.5 text-[13px]">
                    <p><span className="text-[#60A5FA]">~</span> <span className="text-white">$ stardest deploy main</span></p>
                    <p className="text-[#4a6a8a] pl-2">» Analyzing repository structure</p>
                    <p className="text-[#4a6a8a] pl-2">» Provisioning isolated container</p>
                    <p className="text-white pl-2">✓ Build compiled successfully in 1.2s</p>
                    <p className="text-[#60A5FA] font-semibold pl-2">✓ Live at prod-489x.stardest.app</p>
                  </div>
                </div>
              </div>

              {/* Small card — Security */}
              <div className="rounded-2xl bg-[#0F2C45]/40 border border-[#2F4A67]/50 p-8 hover:border-[#2F4A67] transition-all duration-500">
                <div className="w-12 h-12 rounded-xl bg-[#0b0f19] border border-[#2F4A67] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{h.cards[1].title}</h3>
                <p className="text-[#CBCDD3] leading-relaxed">{h.cards[1].desc}</p>
              </div>

              {/* Small card — DNS */}
              <div className="rounded-2xl bg-[#0F2C45]/40 border border-[#2F4A67]/50 p-8 hover:border-[#2F4A67] transition-all duration-500">
                <div className="w-12 h-12 rounded-xl bg-[#0b0f19] border border-[#2F4A67] flex items-center justify-center mb-6">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{h.cards[2].title}</h3>
                <p className="text-[#CBCDD3] leading-relaxed">{h.cards[2].desc}</p>
              </div>

              {/* Big card — Observability */}
              <div className="md:col-span-2 rounded-2xl bg-[#0F2C45]/40 border border-[#2F4A67]/50 p-8 hover:border-[#2F4A67] transition-all duration-500 group">
                <div className="flex flex-col sm:flex-row gap-8 items-start">
                  <div className="flex-1">
                    <div className="w-12 h-12 rounded-xl bg-[#0b0f19] border border-[#2F4A67] flex items-center justify-center mb-6">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{h.cards[3].title}</h3>
                    <p className="text-[#CBCDD3] leading-relaxed">{h.cards[3].desc}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-end gap-2 h-28 mt-auto border-b-2 border-[#2F4A67]/50 pb-0">
                    {[35, 60, 45, 85, 55, 70, 40].map((h, i) => (
                      <div
                        key={i}
                        className={`w-6 rounded-t-md transition-all duration-700 ${i === 3 ? 'bg-[#3B82F6] shadow-[0_0_12px_#3B82F6]' : 'bg-[#2F4A67]/70'}`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ============ TIMELINE ============ */}
        <section className="py-20 sm:py-28 px-5 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-14 sm:mb-20">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-5 tracking-tight">
                {h.timeline_title}
              </h2>
              <p className="text-[#CBCDD3] text-base sm:text-lg">{h.timeline_sub}</p>
            </div>

            <div className="relative pl-16">
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-[#2F4A67] via-[#3B82F6] to-transparent" />
              {h.timeline_steps.map(({ title, desc }, i) => {
                const accent = i === h.timeline_steps.length - 1;
                return (
                  <div key={i} className="relative flex items-start gap-6 mb-16 last:mb-0">
                    <div className={`absolute -left-[52px] w-12 h-12 rounded-full flex items-center justify-center text-lg font-black flex-shrink-0 z-10
                      ${accent
                        ? 'bg-[#0F2C45] border-2 border-[#60A5FA] text-white shadow-[0_0_25px_rgba(59,130,246,0.5)]'
                        : 'bg-[#0b0f19] border-2 border-[#2F4A67] text-white'}`}
                    >
                      {i + 1}
                    </div>
                    <div className="pt-1">
                      <h4 className="text-xl font-bold text-white mb-2">{title}</h4>
                      <p className="text-[#CBCDD3] leading-relaxed">{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="py-20 sm:py-28 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center rounded-3xl bg-gradient-to-b from-[#0F2C45]/60 to-[#0b0f19]/40 border border-[#2F4A67]/50 px-5 sm:px-8 py-14 sm:py-20">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#0b0f19] border border-[#2F4A67] flex items-center justify-center mx-auto mb-6 sm:mb-8">
              <svg className="w-8 h-8 text-[#60A5FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zm0 0l4.94-4.94m6.34-8.5a12.88 12.88 0 010 9.17m-2.83-6.34a8.5 8.5 0 010 3.5"/>
              </svg>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 tracking-tight">{h.cta_title}</h2>
            <p className="text-base sm:text-xl text-[#CBCDD3] mb-8 sm:mb-12 max-w-2xl mx-auto font-light leading-relaxed">{h.cta_sub}</p>
            <Link
              to="/deploy"
              className="inline-flex px-8 sm:px-12 py-4 sm:py-5 bg-white text-[#0b0f19] hover:bg-[#dbeafe] font-black rounded-xl transition-all duration-300 shadow-[0_8px_40px_rgba(255,255,255,0.12)] hover:shadow-[0_8px_50px_rgba(255,255,255,0.2)] text-sm sm:text-base tracking-wide"
            >
              {h.cta_btn}
            </Link>
          </div>
        </section>

        {/* ============ FOOTER ============ */}
        <footer className="border-t border-[#2F4A67]/30 pt-16 pb-10 px-6 bg-[#040812]">
          <div className="max-w-6xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-16">
              {h.footer.columns.map(({ title, links }) => (
                <div key={title}>
                  <h4 className="text-white font-bold mb-5 tracking-widest uppercase text-xs">{title}</h4>
                  <ul className="space-y-3">
                    {links.map((l) => (
                      <li key={l}>
                        <a href="#" className="text-[#CBCDD3]/70 hover:text-white transition text-sm">{l}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-[#2F4A67]/30 pt-8 flex flex-col sm:flex-row justify-between items-center text-[#CBCDD3]/50 text-sm gap-4">
              <p>{h.footer.copy}</p>
              <div className="flex gap-6">
                <a href="#" className="hover:text-white transition">{h.footer.status}</a>
                <a href="#" className="hover:text-white transition">{h.footer.sla}</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
