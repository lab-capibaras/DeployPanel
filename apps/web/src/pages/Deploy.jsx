import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import PixelRocket from '../components/PixelRocket';

/** Lightweight hook: re-renders when theme/lang changes */
function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
}

/* ─── Starfield Canvas ─── */
function PixelStarfield({ dark = true }) {
  const canvasRef = useRef(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Star colors per mode
    const darkColors  = ['#00d4ff','#9b59ff','#2d5fff','#e8eeff','#e8eeff'];
    const lightColors = ['#2d5fff','#1a3aaa','#4a7fff','#9b59ff','#0d1f6e'];

    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      size: Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1,
      speed: Math.random() * 0.25 + 0.03,
      twinkle: Math.random() * Math.PI * 2,
    }));
    const shoots = Array.from({ length: 2 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.4,
      vx: 5, vy: 3, life: 0, maxLife: 70, delay: Math.random() * 400 + 100,
    }));

    const draw = () => {
      const isDark = darkRef.current;
      const colors = isDark ? darkColors : lightColors;

      // Background trail
      ctx.fillStyle = isDark ? 'rgba(8,8,24,0.22)' : 'rgba(240,244,255,0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      stars.forEach((s, i) => {
        s.twinkle += 0.035;
        const alpha = 0.35 + 0.65 * Math.abs(Math.sin(s.twinkle));
        ctx.globalAlpha = isDark ? alpha : Math.min(1, alpha * 1.4);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
        if (s.size === 3) {
          ctx.globalAlpha *= 0.35;
          ctx.fillRect(Math.floor(s.x)-2, Math.floor(s.y)+1, 2, 1);
          ctx.fillRect(Math.floor(s.x)+3, Math.floor(s.y)+1, 2, 1);
          ctx.fillRect(Math.floor(s.x)+1, Math.floor(s.y)-2, 1, 2);
          ctx.fillRect(Math.floor(s.x)+1, Math.floor(s.y)+3, 1, 2);
        }
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
      });

      // Shooting stars
      shoots.forEach(sh => {
        sh.delay--;
        if (sh.delay > 0) return;
        sh.life++;
        if (sh.life > sh.maxLife) {
          sh.x = Math.random()*canvas.width; sh.y = Math.random()*canvas.height*0.3;
          sh.life = 0; sh.delay = Math.random()*300+150; return;
        }
        const isDark2 = darkRef.current;
        const p = sh.life / sh.maxLife;
        const trailColor = isDark2 ? '#00d4ff' : '#2d5fff';
        const headColor  = isDark2 ? '#ffffff' : '#1a3aaa';
        for (let i = 0; i < 18; i++) {
          ctx.globalAlpha = (i/18) * (p < 0.8 ? p/0.8 : (1-p)/0.2) * 0.9;
          ctx.fillStyle = trailColor;
          ctx.fillRect(Math.floor(sh.x - sh.vx*(i*0.5)), Math.floor(sh.y - sh.vy*(i*0.5)), 2, 1);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = headColor;
        ctx.fillRect(Math.floor(sh.x), Math.floor(sh.y), 3, 2);
        sh.x += sh.vx; sh.y += sh.vy;
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };

    // Fill once immediately so no flash
    ctx.fillStyle = darkRef.current ? '#080818' : '#f0f4ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, imageRendering:'pixelated' }} />;
}

export default function Deploy() {
  const isDark = useTheme();
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
  const [showRocketLaunch, setShowRocketLaunch] = useState(false);
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
        setShowRocketLaunch(true);
        setTimeout(() => {
          setShowRocketLaunch(false);
          setPhase('success');
        }, 3200);
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
      <PixelStarfield dark={isDark} />

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.035) 0px,rgba(0,0,0,0.035) 1px,transparent 1px,transparent 3px)'
      }} />

      {/* Central glow */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, pointerEvents: 'none', zIndex: 1,
        background: 'radial-gradient(ellipse,rgba(45,95,255,0.12) 0%,transparent 70%)',
      }} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 pt-28 pb-20">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40, position: 'relative', zIndex: 2 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            padding: '4px 12px',
            background: 'rgba(45,95,255,0.15)',
            border: '2px solid #2d5fff',
            boxShadow: '2px 2px 0 rgba(0,0,0,0.5)',
            color: '#00d4ff',
            fontFamily: "'Jersey 10',monospace",
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <span className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
            <span>{d.badge}</span>
          </div>
          <h1 style={{
            fontFamily: "'Jersey 10',monospace",
            fontSize: 'clamp(32px, 5vw, 48px)',
            color: '#e8eeff',
            margin: '0 0 8px',
            lineHeight: 1.1,
          }}>
            {d.title_1} <span style={{
              background: 'linear-gradient(90deg,#00d4ff,#2d5fff,#9b59ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              filter: 'drop-shadow(0 0 10px rgba(0,212,255,0.3))',
            }}>{d.title_2}</span>
          </h1>
          <p style={{
            fontFamily: "'Jersey 10',monospace",
            fontSize: 18,
            color: '#6a7ab5',
            margin: 0,
          }}>{d.subtitle}</p>
        </div>

        <div className="w-full max-w-2xl" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{
            background: 'rgba(2,2,16,0.85)',
            border: '2px solid #1e2d7a',
            boxShadow: '6px 6px 0 rgba(0,0,0,0.7), 0 0 40px rgba(45,95,255,0.15)',
            padding: '36px 32px',
          }}>

            {/* Panel header bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 28, borderBottom: '1px solid #1e2d7a', paddingBottom: 16,
            }}>
              {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                <div key={c} style={{ width: 9, height: 9, background: c }} />
              ))}
              <span style={{
                marginLeft: 8, fontFamily: "'Share Tech Mono',monospace",
                fontSize: 12, color: '#4a6a9a', letterSpacing: '0.05em',
              }}>
                stardest — mission-control
              </span>
            </div>

            {/* ======= FORM ======= */}
            {phase === 'form' && (
              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Repo URL */}
                <div>
                  <label style={{
                    display: 'block',
                    fontFamily: "'Jersey 10',monospace",
                    fontSize: 15,
                    color: '#8ab0ff',
                    marginBottom: 8,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>{d.form.repo_label}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder={d.form.repo_placeholder}
                      value={formData.repoUrl}
                      onChange={e => setFormData(f => ({ ...f, repoUrl: e.target.value }))}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#2d5fff';
                        e.target.style.boxShadow = '0 0 0 1px #2d5fff, inset 0 0 12px rgba(45,95,255,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#1e2d7a';
                        e.target.style.boxShadow = 'inset 0 0 8px rgba(0,0,0,0.4)';
                      }}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: '#020210',
                        border: '2px solid #1e2d7a',
                        color: '#e8eeff',
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: 'inset 0 0 8px rgba(0,0,0,0.4)',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    />
                    <button
                      type="button"
                      onClick={loadBranches}
                      disabled={loadingBranches}
                      onMouseEnter={(e) => {
                        if (!loadingBranches) {
                          e.currentTarget.style.background = 'linear-gradient(135deg,#1a3aff,#0f1f5c)';
                          e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)';
                          e.currentTarget.style.transform = 'translate(-1px,-1px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg,#0f1f5c,#1a3aff)';
                        e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                        e.currentTarget.style.transform = 'none';
                      }}
                      style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg,#0f1f5c,#1a3aff)',
                        border: '2px solid #2d5fff',
                        color: '#e8eeff',
                        fontFamily: "'Jersey 10',monospace",
                        fontSize: 16,
                        letterSpacing: '0.05em',
                        cursor: loadingBranches ? 'not-allowed' : 'pointer',
                        boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                        transition: 'all 0.1s steps(2)',
                        opacity: loadingBranches ? 0.6 : 1,
                      }}
                    >
                      {loadingBranches ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          {d.form.loading}
                        </span>
                      ) : d.form.load_branches}
                    </button>
                  </div>
                  {parsedRepo && (
                    <p style={{ fontSize: 13, color: '#00d4ff', marginTop: 6, margin: '6px 0 0', fontFamily: "'Jersey 10',monospace" }}>
                      {d.form.repo_hint} <strong>{parsedRepo.owner}/{parsedRepo.repo}</strong>
                    </p>
                  )}
                </div>

                {/* Branch */}
                {branches.length > 0 && (
                  <div>
                    <label style={{
                      display: 'block',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 15,
                      color: '#8ab0ff',
                      marginBottom: 8,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}>{d.form.branch_label}</label>
                    <select
                      value={formData.branch}
                      onChange={e => setFormData(f => ({ ...f, branch: e.target.value }))}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#2d5fff';
                        e.target.style.boxShadow = '0 0 0 1px #2d5fff, inset 0 0 12px rgba(45,95,255,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#1e2d7a';
                        e.target.style.boxShadow = 'inset 0 0 8px rgba(0,0,0,0.4)';
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#020210',
                        border: '2px solid #1e2d7a',
                        color: '#e8eeff',
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: 'inset 0 0 8px rgba(0,0,0,0.4)',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      {branches.map(b => <option key={b} value={b} style={{ background: '#020210', color: '#e8eeff' }}>{b}</option>)}
                    </select>
                  </div>
                )}

                {/* Subdomain */}
                <div>
                  <label style={{
                    display: 'block',
                    fontFamily: "'Jersey 10',monospace",
                    fontSize: 15,
                    color: '#8ab0ff',
                    marginBottom: 8,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>{d.form.subdomain_label}</label>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <input
                      type="text"
                      placeholder={d.form.subdomain_ph}
                      value={formData.subdomain}
                      onChange={handleSubdomainChange}
                      onFocus={(e) => {
                        e.target.style.borderColor = subdomainError ? '#ef4444' : '#2d5fff';
                        e.target.style.boxShadow = subdomainError ? '0 0 0 1px #ef4444' : '0 0 0 1px #2d5fff, inset 0 0 12px rgba(45,95,255,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = subdomainError ? '#ef4444' : '#1e2d7a';
                        e.target.style.boxShadow = 'inset 0 0 8px rgba(0,0,0,0.4)';
                      }}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: '#020210',
                        border: `2px solid ${subdomainError ? '#ef4444' : '#1e2d7a'}`,
                        color: '#e8eeff',
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: 'inset 0 0 8px rgba(0,0,0,0.4)',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    />
                    <span style={{
                      padding: '12px 16px',
                      background: '#131333',
                      border: '2px solid #1e2d7a',
                      borderLeft: 'none',
                      color: '#6a7ab5',
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      {d.form.subdomain_suffix}
                    </span>
                  </div>
                  {subdomainError
                    ? <p style={{ fontSize: 13, color: '#fca5a5', marginTop: 6, margin: '6px 0 0', fontFamily: "'Jersey 10',monospace" }}>{subdomainError}</p>
                    : formData.subdomain && (
                      <p style={{ fontSize: 13, color: '#00d4ff', marginTop: 6, margin: '6px 0 0', fontFamily: "'Jersey 10',monospace" }}>
                        {d.form.subdomain_url} <strong>https://{formData.subdomain}.stardest.com</strong>
                      </p>
                    )
                  }
                </div>

                <button
                  type="submit"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg,#1a3aff,#0f1f5c)';
                    e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 20px rgba(45,95,255,0.4)';
                    e.currentTarget.style.transform = 'translate(-1px,-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg,#0f1f5c,#1a3aff)';
                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                    e.currentTarget.style.transform = 'none';
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg,#0f1f5c,#1a3aff)',
                    border: '2px solid #2d5fff',
                    color: '#e8eeff',
                    fontFamily: "'Jersey 10',monospace",
                    fontSize: 18,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                    transition: 'all 0.1s steps(2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  {d.form.submit}
                  <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            )}

            {/* ======= CONFIRM ======= */}
            {phase === 'confirm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'Jersey 10',monospace", fontSize: 24, color: '#e8eeff', margin: '0 0 6px' }}>{d.confirm.title}</h2>
                  <p style={{ fontFamily: "'Jersey 10',monospace", fontSize: 16, color: '#6a7ab5', margin: 0 }}>{d.confirm.sub}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: d.confirm.repo,   value: `${parsedRepo?.owner}/${parsedRepo?.repo}` },
                    { label: d.confirm.branch, value: formData.branch },
                    { label: d.confirm.url,    value: `https://${formData.subdomain}.stardest.com`, accent: true },
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: '#020210',
                      border: '2px solid #1e2d7a',
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: 14,
                    }}>
                      <span style={{ color: '#6a7ab5' }}>{label}</span>
                      <span style={{ color: accent ? '#00d4ff' : '#e8eeff', fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setPhase('form')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2d5fff';
                      e.currentTarget.style.color = '#e8eeff';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#1e2d7a';
                      e.currentTarget.style.color = '#6a7ab5';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '2px solid #1e2d7a',
                      color: '#6a7ab5',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                    }}
                  >
                    {d.confirm.edit}
                  </button>
                  <button
                    onClick={startDeploy}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg,#1a3aff,#0f1f5c)';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 20px rgba(45,95,255,0.4)';
                      e.currentTarget.style.transform = 'translate(-1px,-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg,#0f1f5c,#1a3aff)';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                      e.currentTarget.style.transform = 'none';
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      background: 'linear-gradient(135deg,#0f1f5c,#1a3aff)',
                      border: '2px solid #2d5fff',
                      color: '#e8eeff',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                      fontWeight: 'bold',
                    }}
                  >
                    {d.confirm.confirm}
                  </button>
                </div>
              </div>
            )}

            {/* ======= PROGRESS ======= */}
            {phase === 'progress' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontFamily: "'Jersey 10',monospace", fontSize: 22, color: '#e8eeff', margin: 0 }}>{d.progress.title}</h2>
                    <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#6a7ab5', margin: '4px 0 0' }}>{formData.subdomain}.stardest.com</p>
                  </div>
                  <span style={{ fontFamily: "'Jersey 10',monospace", fontSize: 28, color: '#e8eeff', fontWeight: 'bold' }}>{Math.round(progress)}%</span>
                </div>

                <div style={{
                  width: '100%',
                  height: 14,
                  background: '#020210',
                  border: '2px solid #1e2d7a',
                  padding: 2,
                  boxSizing: 'border-box',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: 'repeating-linear-gradient(90deg, #2d5fff 0px, #2d5fff 6px, #00d4ff 6px, #00d4ff 8px)',
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { key: 'clone',   label: d.progress.clone,   threshold: 35 },
                    { key: 'build',   label: d.progress.build,   threshold: 65 },
                    { key: 'publish', label: d.progress.publish,  threshold: 95 },
                  ].map(({ key, label, threshold }) => {
                    const done   = progress >= threshold;
                    const active = progress > threshold - 35 && progress < threshold;
                    return (
                      <div key={key} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 8px',
                        border: `2px solid ${done ? '#10b981' : active ? '#2d5fff' : '#1e2d7a'}`,
                        background: done ? 'rgba(16,185,129,0.1)' : active ? 'rgba(45,95,255,0.15)' : 'transparent',
                        fontFamily: "'Jersey 10',monospace",
                        fontSize: 13,
                        flex: 1,
                        textAlign: 'center',
                      }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: done ? '#10b981' : active ? '#2d5fff' : '#020210',
                          border: `2px solid ${done ? '#10b981' : active ? '#2d5fff' : '#1e2d7a'}`,
                        }}>
                          {done
                            ? <svg style={{ width: 14, height: 14, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                            : active
                              ? <div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                              : <div style={{ width: 6, height: 6, background: '#1e2d7a' }} />
                          }
                        </div>
                        <span style={{ color: done ? '#10b981' : active ? '#e8eeff' : '#4a6a9a', fontWeight: 'bold' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>

                <div ref={logRef} style={{
                  height: 200,
                  overflowY: 'auto',
                  background: '#020210',
                  border: '2px solid #1e2d7a',
                  padding: 16,
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}>
                  {logLines.map((line, i) => (
                    <p key={i} className={line.color} style={{ margin: '0 0 6px', lineHeight: 1.4 }}>{line.text}</p>
                  ))}
                  <p style={{ margin: 0, color: '#2d5fff', animation: 'px-blink 1s steps(1) infinite' }}>█</p>
                </div>
              </div>
            )}

            {/* ======= SUCCESS ======= */}
            {phase === 'success' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: 'rgba(16,185,129,0.15)',
                  border: '2px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  boxShadow: '0 0 16px rgba(16,185,129,0.3)',
                }}>
                  <svg style={{ width: 28, height: 28, color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "'Jersey 10',monospace", fontSize: 26, color: '#e8eeff', margin: '0 0 8px' }}>{d.success.title}</h2>
                <p style={{ fontFamily: "'Jersey 10',monospace", fontSize: 16, color: '#6a7ab5', margin: '0 0 28px' }}>{d.success.sub}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
                  {[
                    { label: d.success.repo,   value: `${parsedRepo?.owner}/${parsedRepo?.repo}` },
                    { label: d.success.branch, value: formData.branch },
                    { label: d.success.status, value: d.success.status_val, green: true },
                  ].map(({ label, value, green }) => (
                    <div key={label} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: '#020210',
                      border: '2px solid #1e2d7a',
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: 14,
                    }}>
                      <span style={{ color: '#6a7ab5' }}>{label}</span>
                      <span style={{ color: green ? '#10b981' : '#e8eeff', fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <a
                    href={successUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(16,185,129,0.25)';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(16,185,129,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(16,185,129,0.15)';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      background: 'rgba(16,185,129,0.15)',
                      border: '2px solid #10b981',
                      color: '#a7f3d0',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 18,
                      letterSpacing: '0.05em',
                      textDecoration: 'none',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontWeight: 'bold',
                      boxSizing: 'border-box',
                    }}
                  >
                    <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    {d.success.open}
                  </a>
                  <button
                    onClick={reset}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2d5fff';
                      e.currentTarget.style.color = '#e8eeff';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#1e2d7a';
                      e.currentTarget.style.color = '#6a7ab5';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.5)';
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: 'transparent',
                      border: '2px solid #1e2d7a',
                      color: '#6a7ab5',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                    }}
                  >
                    {d.success.new_deploy}
                  </button>
                </div>
              </div>
            )}

            {/* ======= ERROR ======= */}
            {phase === 'error' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: 'rgba(239,68,68,0.15)',
                  border: '2px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  boxShadow: '0 0 16px rgba(239,68,68,0.3)',
                }}>
                  <svg style={{ width: 28, height: 28, color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "'Jersey 10',monospace", fontSize: 26, color: '#e8eeff', margin: '0 0 8px' }}>{d.error.title}</h2>
                <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 14, color: '#fca5a5', margin: '0 0 28px' }}>{errorMessage}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    onClick={startDeploy}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg,#1a3aff,#0f1f5c)';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 20px rgba(45,95,255,0.4)';
                      e.currentTarget.style.transform = 'translate(-1px,-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg,#0f1f5c,#1a3aff)';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.6)';
                      e.currentTarget.style.transform = 'none';
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      background: 'linear-gradient(135deg,#0f1f5c,#1a3aff)',
                      border: '2px solid #2d5fff',
                      color: '#e8eeff',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 18,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                      fontWeight: 'bold',
                    }}
                  >
                    {d.error.retry}
                  </button>
                  <button
                    onClick={reset}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2d5fff';
                      e.currentTarget.style.color = '#e8eeff';
                      e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.7), 0 0 12px rgba(45,95,255,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#1e2d7a';
                      e.currentTarget.style.color = '#6a7ab5';
                      e.currentTarget.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.5)';
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: 'transparent',
                      border: '2px solid #1e2d7a',
                      color: '#6a7ab5',
                      fontFamily: "'Jersey 10',monospace",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.6)',
                      transition: 'all 0.1s steps(2)',
                    }}
                  >
                    {d.error.modify}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ======= TOASTS ======= */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(toast => {
          const cfg = {
            success: { bg: 'rgba(16,185,129,0.15)', border: '#10b981', text: '#a7f3d0', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /> },
            error:   { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444', text: '#fca5a5', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /> },
            warning: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#fde68a', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /> },
            info:    { bg: 'rgba(13,13,43,0.85)',   border: '#1e2d7a', text: '#e8eeff', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          }[toast.type] || {};
          return (
            <div key={toast.id} className="animate-fade-in" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: cfg.bg,
              border: `2px solid ${cfg.border}`,
              boxShadow: '4px 4px 0 rgba(0,0,0,0.6)',
              minWidth: 280,
              maxWidth: 380,
              fontFamily: "'Share Tech Mono',monospace",
            }}>
              <svg style={{ width: 20, height: 20, flexShrink: 0, color: cfg.border }} fill="none" stroke="currentColor" viewBox="0 0 24 24">{cfg.icon}</svg>
              <span style={{ flex: 1, fontSize: 13, color: cfg.text }}>{toast.message}</span>
              <button onClick={() => setToasts(p => p.filter(t => t.id !== toast.id))} style={{ color: cfg.text, opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* ======= LAUNCH ANIMATION OVERLAY ======= */}
      {showRocketLaunch && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#020210',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Fast falling space stars */}
          <div className="launch-stars" />

          {/* Title */}
          <div style={{
            fontFamily: "'Jersey 10',monospace",
            fontSize: 32,
            color: '#00d4ff',
            textShadow: '0 0 12px rgba(0,212,255,0.6)',
            marginBottom: 60,
            textAlign: 'center',
            animation: 'pulse 1s infinite alternate',
            zIndex: 10,
          }}>
            LAUNCHING SATELLITE...
          </div>

          {/* Animated PixelRocket */}
          <div style={{
            animation: 'rocket-sequence 3.2s cubic-bezier(0.85, 0, 0.15, 1) forwards',
            zIndex: 5,
          }}>
            <div style={{
              animation: 'rocket-vibrate 0.1s infinite',
            }}>
              <PixelRocket scale={3.5} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Rocket launch sequence keyframes */
        @keyframes rocket-sequence {
          0% { transform: translateY(100vh) scale(0.8); }
          25% { transform: translateY(12vh) scale(1); }
          65% { transform: translateY(12vh) scale(1); }
          100% { transform: translateY(-130vh) scale(1.3); }
        }
        @keyframes rocket-vibrate {
          0% { transform: translate(1px, 0); }
          50% { transform: translate(-1px, 1px); }
          100% { transform: translate(0, -1px); }
        }
        @keyframes pulse {
          from { opacity: 0.6; }
          to { opacity: 1; }
        }

        /* Falling stars effect */
        .launch-stars {
          position: absolute;
          inset: 0;
          background-image: 
            radial-gradient(1.5px 1.5px at 30px 40px, #ffffff, transparent),
            radial-gradient(2px 2px at 80px 110px, #00d4ff, transparent),
            radial-gradient(1.5px 2px at 140px 220px, #9b59ff, transparent),
            radial-gradient(2px 1.5px at 190px 70px, #ffffff, transparent),
            radial-gradient(1.5px 1.5px at 240px 290px, #00d4ff, transparent),
            radial-gradient(2px 2.5px at 280px 160px, #ffffff, transparent);
          background-size: 320px 320px;
          animation: stars-fall 0.4s linear infinite;
          opacity: 0.85;
        }
        @keyframes stars-fall {
          from { background-position: 0 0; }
          to { background-position: 0 320px; }
        }
      `}</style>
    </div>
  );
}
