import React, { useState, useRef, useEffect } from 'react';
import Starfield from '../components/Starfield';
import { useTranslation } from '../i18n';

export default function Deploy() {
  const t = useTranslation();
  const d = t.deploy;

  const [formData, setFormData] = useState({ repoUrl: '', branch: '', subdomain: '' });
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  // states: 'form' | 'confirm' | 'progress' | 'success' | 'error'
  const [phase, setPhase] = useState('form');
  const [errorMessage, setErrorMessage] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [toasts, setToasts] = useState([]);
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState([]);
  const [subdomainError, setSubdomainError] = useState('');
  const logRef = useRef(null);
  const toastIdRef = useRef(0);
  const timerRefs = useRef([]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const showToast = (message, type = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(toast => toast.id !== id)), 4500);
  };

  const parseGithubUrl = (url) => {
    const regex = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/;
    const match = url.trim().match(regex);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const validateSubdomain = (value) => {
    if (!value) return d.validation.required;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) return d.validation.invalid;
    if (value.length > 40) return d.validation.too_long;
    return '';
  };

  const handleSubdomainChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setFormData(f => ({ ...f, subdomain: val }));
    setSubdomainError(validateSubdomain(val));
  };

  const loadBranches = async () => {
    if (!formData.repoUrl.trim()) { showToast(d.validation.no_repo, 'warning'); return; }
    const parsed = parseGithubUrl(formData.repoUrl);
    if (!parsed) { showToast(d.validation.invalid_url, 'error'); return; }
    setLoadingBranches(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches`);
      if (!res.ok) throw new Error('Repositorio no encontrado o privado');
      const data = await res.json();
      const names = data.map(b => b.name);
      setBranches(names);
      setFormData(f => ({ ...f, branch: names[0] || '' }));
      showToast(d.toasts.branches_loaded(names.length), 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formData.repoUrl.trim() || !formData.branch || !formData.subdomain.trim()) {
      showToast(d.validation.fill_all, 'warning');
      return;
    }
    const err = validateSubdomain(formData.subdomain);
    if (err) { setSubdomainError(err); return; }
    setPhase('confirm');
  };

  const startDeploy = async () => {
    setPhase('progress');
    setLogLines([]);
    setProgress(0);
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    // Use the logs from the current locale
    d.logs.forEach(({ delay, text, color }) => {
      const timer = setTimeout(() => {
        setLogLines(prev => [...prev, { text, color }]);
        setProgress(Math.min((delay / 10500) * 95, 95));
      }, delay);
      timerRefs.current.push(timer);
    });

    const finalTimer = setTimeout(async () => {
      try {
        const response = await fetch('/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!response.ok) throw new Error(d.toasts.server_error);
        setProgress(100);
        setSuccessUrl(`https://${formData.subdomain}.stardest.com`);
        setPhase('success');
      } catch (err) {
        setErrorMessage(err.message);
        setPhase('error');
        showToast('Error: ' + err.message, 'error');
      }
    }, 11000);
    timerRefs.current.push(finalTimer);
  };

  const reset = () => {
    timerRefs.current.forEach(clearTimeout);
    setFormData({ repoUrl: '', branch: '', subdomain: '' });
    setBranches([]);
    setErrorMessage('');
    setSuccessUrl('');
    setProgress(0);
    setLogLines([]);
    setSubdomainError('');
    setPhase('form');
  };

  const parsedRepo = parseGithubUrl(formData.repoUrl);

  // ===== RENDER =====
  return (
    <div className="relative min-h-screen bg-[#0b0f19] overflow-x-hidden">
      <Starfield />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 pt-28 pb-20">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-5 px-5 py-2 bg-[#0F2C45]/40 border border-[#2F4A67]/60 rounded-full">
            <span className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
            <span className="text-[#CBCDD3] text-sm font-medium tracking-wide">{d.badge}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-2">
            {d.title_1} <span className="bg-gradient-to-r from-[#60A5FA] to-[#3B82F6] bg-clip-text text-transparent">{d.title_2}</span>
          </h1>
          <p className="text-[#CBCDD3] text-base font-light">{d.subtitle}</p>
        </div>

        <div className="w-full max-w-2xl">
          <div className="rounded-2xl bg-[#0F2C45]/25 border border-[#2F4A67]/50 overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)]">

            {/* ======= FORM ======= */}
            {phase === 'form' && (
              <div className="p-7 sm:p-10">
                <form onSubmit={handleFormSubmit} className="space-y-6">

                  {/* Repo URL */}
                  <div>
                    <label className="block text-sm font-semibold text-[#CBCDD3] mb-2">{d.form.repo_label}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={d.form.repo_placeholder}
                        value={formData.repoUrl}
                        onChange={e => setFormData(f => ({ ...f, repoUrl: e.target.value }))}
                        className="flex-1 px-4 py-3 bg-[#0b0f19]/70 border border-[#2F4A67]/50 rounded-xl text-white placeholder-[#CBCDD3]/40 focus:outline-none focus:border-[#60A5FA]/60 transition text-sm"
                      />
                      <button
                        type="button"
                        onClick={loadBranches}
                        disabled={loadingBranches}
                        className="flex-shrink-0 px-4 py-3 bg-[#2F4A67]/60 hover:bg-[#2F4A67] disabled:opacity-50 text-white rounded-xl transition font-medium text-sm whitespace-nowrap border border-[#2F4A67]"
                      >
                        {loadingBranches
                          ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{d.form.loading}</span>
                          : d.form.load_branches}
                      </button>
                    </div>
                    {parsedRepo && (
                      <p className="text-xs text-[#60A5FA] mt-1.5 pl-1">
                        {d.form.repo_hint} <strong>{parsedRepo.owner}/{parsedRepo.repo}</strong>
                      </p>
                    )}
                  </div>

                  {/* Branch */}
                  {branches.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-[#CBCDD3] mb-2">{d.form.branch_label}</label>
                      <select
                        value={formData.branch}
                        onChange={e => setFormData(f => ({ ...f, branch: e.target.value }))}
                        className="w-full px-4 py-3 bg-[#0b0f19]/70 border border-[#2F4A67]/50 rounded-xl text-white focus:outline-none focus:border-[#60A5FA]/60 transition text-sm"
                      >
                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Subdomain */}
                  <div>
                    <label className="block text-sm font-semibold text-[#CBCDD3] mb-2">{d.form.subdomain_label}</label>
                    <div className="flex items-stretch">
                      <input
                        type="text"
                        placeholder={d.form.subdomain_ph}
                        value={formData.subdomain}
                        onChange={handleSubdomainChange}
                        className={`flex-1 px-4 py-3 bg-[#0b0f19]/70 border rounded-l-xl text-white placeholder-[#CBCDD3]/40 focus:outline-none transition text-sm ${subdomainError ? 'border-red-500/60 focus:border-red-400' : 'border-[#2F4A67]/50 focus:border-[#60A5FA]/60'}`}
                      />
                      <span className="px-4 py-3 bg-[#0b0f19]/50 border border-l-0 border-[#2F4A67]/50 rounded-r-xl text-[#CBCDD3]/60 text-sm flex items-center">
                        {d.form.subdomain_suffix}
                      </span>
                    </div>
                    {subdomainError
                      ? <p className="text-xs text-red-400 mt-1.5 pl-1">{subdomainError}</p>
                      : formData.subdomain && (
                        <p className="text-xs text-[#60A5FA] mt-1.5 pl-1">
                          {d.form.subdomain_url} <strong>https://{formData.subdomain}.stardest.com</strong>
                        </p>
                      )
                    }
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-[#0F2C45] hover:bg-[#1a3f5e] border border-[#2F4A67] hover:border-[#60A5FA]/50 text-white font-bold rounded-xl transition-all duration-300 shadow-[0_0_25px_rgba(15,44,69,0.5)] hover:shadow-[0_0_40px_rgba(47,74,103,0.6)] flex items-center justify-center gap-2 group"
                  >
                    {d.form.submit}
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </form>
              </div>
            )}

            {/* ======= CONFIRM ======= */}
            {phase === 'confirm' && (
              <div className="p-7 sm:p-10">
                <div className="mb-8">
                  <h2 className="text-xl font-bold text-white mb-1">{d.confirm.title}</h2>
                  <p className="text-[#CBCDD3] text-sm">{d.confirm.sub}</p>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    { label: d.confirm.repo,   value: `${parsedRepo?.owner}/${parsedRepo?.repo}` },
                    { label: d.confirm.branch, value: formData.branch },
                    { label: d.confirm.url,    value: `https://${formData.subdomain}.stardest.com`, accent: true },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="flex items-center justify-between py-4 px-5 rounded-xl bg-[#0b0f19]/60 border border-[#2F4A67]/40">
                      <span className="text-[#CBCDD3] text-sm">{label}</span>
                      <span className={`text-sm font-semibold ${accent ? 'text-[#60A5FA]' : 'text-white'}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPhase('form')} className="flex-1 py-3 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 rounded-xl transition font-medium text-sm">
                    {d.confirm.edit}
                  </button>
                  <button onClick={startDeploy} className="flex-1 py-3 bg-[#0F2C45] hover:bg-[#1a3f5e] border border-[#2F4A67] text-white rounded-xl transition font-bold text-sm shadow-[0_0_20px_rgba(15,44,69,0.5)]">
                    {d.confirm.confirm}
                  </button>
                </div>
              </div>
            )}

            {/* ======= PROGRESS ======= */}
            {phase === 'progress' && (
              <div className="p-7 sm:p-10">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{d.progress.title}</h2>
                    <p className="text-[#CBCDD3] text-xs mt-0.5">{formData.subdomain}.stardest.com</p>
                  </div>
                  <span className="text-2xl font-black text-white">{Math.round(progress)}%</span>
                </div>

                <div className="w-full h-1.5 bg-[#2F4A67]/30 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-gradient-to-r from-[#1e3a5f] via-[#3B82F6] to-[#60A5FA] rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 mb-7">
                  {[
                    { key: 'clone',   label: d.progress.clone,   threshold: 35 },
                    { key: 'build',   label: d.progress.build,   threshold: 65 },
                    { key: 'publish', label: d.progress.publish,  threshold: 95 },
                  ].map(({ key, label, threshold }) => {
                    const done   = progress >= threshold;
                    const active = progress > threshold - 35 && progress < threshold;
                    return (
                      <div key={key} className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all duration-500 ${done ? 'border-green-500/40 bg-green-500/10' : active ? 'border-[#2F4A67] bg-[#0F2C45]/40 animate-pulse' : 'border-[#2F4A67]/20 bg-transparent'}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${done ? 'bg-green-500' : active ? 'bg-[#2F4A67]' : 'bg-[#0F2C45]/30 border border-[#2F4A67]/30'}`}>
                          {done
                            ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                            : active
                              ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <div className="w-2 h-2 rounded-full bg-[#2F4A67]/50" />
                          }
                        </div>
                        <span className={`text-xs font-medium ${done ? 'text-green-400' : active ? 'text-white' : 'text-[#CBCDD3]/50'}`}>{label}</span>
                      </div>
                    );
                  })}
                </div>

                <div ref={logRef} className="h-52 overflow-y-auto bg-[#0b0f19]/80 border border-[#2F4A67]/40 rounded-xl p-4 font-mono text-xs space-y-1.5 scroll-smooth">
                  {logLines.map((line, i) => (
                    <p key={i} className={`${line.color} leading-relaxed animate-fade-in`}>{line.text}</p>
                  ))}
                  <p className="text-[#2F4A67] animate-pulse">_</p>
                </div>
              </div>
            )}

            {/* ======= SUCCESS ======= */}
            {phase === 'success' && (
              <div className="p-7 sm:p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-2">{d.success.title}</h2>
                <p className="text-[#CBCDD3] text-sm mb-8">{d.success.sub}</p>

                <div className="space-y-3 mb-8 text-left">
                  {[
                    { label: d.success.repo,   value: `${parsedRepo?.owner}/${parsedRepo?.repo}` },
                    { label: d.success.branch, value: formData.branch },
                    { label: d.success.status, value: d.success.status_val, green: true },
                  ].map(({ label, value, green }) => (
                    <div key={label} className="flex justify-between items-center py-3 px-5 bg-[#0b0f19]/60 rounded-xl border border-[#2F4A67]/30">
                      <span className="text-[#CBCDD3] text-sm">{label}</span>
                      <span className={`text-sm font-semibold ${green ? 'text-green-400' : 'text-white'}`}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <a href={successUrl} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-300 font-bold rounded-xl transition flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    {d.success.open}
                  </a>
                  <button onClick={reset} className="w-full py-4 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 font-medium rounded-xl transition text-sm">
                    {d.success.new_deploy}
                  </button>
                </div>
              </div>
            )}

            {/* ======= ERROR ======= */}
            {phase === 'error' && (
              <div className="p-7 sm:p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-2">{d.error.title}</h2>
                <p className="text-[#CBCDD3] text-sm mb-8">{errorMessage}</p>
                <div className="flex flex-col gap-3">
                  <button onClick={startDeploy} className="w-full py-4 bg-[#0F2C45] hover:bg-[#1a3f5e] border border-[#2F4A67] text-white font-bold rounded-xl transition">
                    {d.error.retry}
                  </button>
                  <button onClick={reset} className="w-full py-4 border border-[#2F4A67]/50 text-[#CBCDD3] hover:text-white hover:bg-[#2F4A67]/20 font-medium rounded-xl transition text-sm">
                    {d.error.modify}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ======= TOASTS ======= */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2">
        {toasts.map(toast => {
          const cfg = {
            success: { bg: 'bg-green-500/20 border-green-500/50',  text: 'text-green-300',  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /> },
            error:   { bg: 'bg-red-500/20 border-red-500/50',      text: 'text-red-300',    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /> },
            warning: { bg: 'bg-yellow-500/20 border-yellow-500/50', text: 'text-yellow-300', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /> },
            info:    { bg: 'bg-[#0F2C45]/80 border-[#2F4A67]',     text: 'text-[#CBCDD3]', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          }[toast.type] || {};
          return (
            <div key={toast.id} className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-md shadow-xl ${cfg.bg} min-w-[280px] max-w-sm animate-fade-in`}>
              <svg className={`w-5 h-5 flex-shrink-0 ${cfg.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">{cfg.icon}</svg>
              <span className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</span>
              <button onClick={() => setToasts(p => p.filter(t => t.id !== toast.id))} className={`${cfg.text} opacity-60 hover:opacity-100 transition`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}
