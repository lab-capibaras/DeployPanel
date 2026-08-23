import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';
import { CheckCircleIcon } from '../components/Icons';
import JSZip from 'jszip';
import { useAuth } from '../hooks/useAuth';
import WebhookInstructions from '../components/WebhookInstructions';
import DotCloud from '../components/DotCloud';


/** Lightweight hook: re-renders when theme/lang changes */
function useTheme() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(setPrefs), []);
  return prefs.theme === 'dark';
}

export default function Deploy() {
  const isDark = useTheme();
  const t = useTranslation();
  const d = t.deploy;

  // ── Mode: 'git' | 'upload' ──
  const [mode, setMode] = useState('git');

  // ── Git deploy state ──
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
  const [webhookInfo, setWebhookInfo] = useState(null);
  const logRef = useRef(null);
  const toastIdRef = useRef(0);
  const timerRefs = useRef([]);

  // ── Upload deploy state ──
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadSubdomain, setUploadSubdomain] = useState('');
  const [uploadSubdomainError, setUploadSubdomainError] = useState('');
  const [uploadPhase, setUploadPhase] = useState('form'); // 'form'|'confirm'|'progress'|'success'|'error'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLogLines, setUploadLogLines] = useState([]);
  const [uploadSuccessUrl, setUploadSuccessUrl] = useState('');
  const [uploadErrorMsg, setUploadErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadLogRef = useRef(null);
  const uploadTimerRefs = useRef([]);
  const fileInputRef = useRef(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // Auto-scroll upload log
  useEffect(() => {
    if (uploadLogRef.current) uploadLogRef.current.scrollTop = uploadLogRef.current.scrollHeight;
  }, [uploadLogLines]);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
      if (!loading && !user) {
          navigate('/login');
      }
  }, [user, loading, navigate]);

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

  const loadBranches = async (urlOverride, preferredBranch) => {
    const repoUrl = urlOverride ?? formData.repoUrl;
    if (!repoUrl.trim()) { showToast(d.validation.no_repo, 'warning'); return; }
    const parsed = parseGithubUrl(repoUrl);
    if (!parsed) { showToast(d.validation.invalid_url, 'error'); return; }
    setLoadingBranches(true);
    try {
      const res = await fetch(`/api/github/branches?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Repositorio no encontrado o privado');
      const names = data.branches;
      setBranches(names);
      setFormData(f => ({ ...f, branch: (preferredBranch && names.includes(preferredBranch)) ? preferredBranch : (names[0] || '') }));
      showToast(d.toasts.branches_loaded(names.length), 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoadingBranches(false);
    }
  };

  // Prellenar el formulario cuando se llega desde el panel de repos del Dashboard
  // (botón "Desplegar" en GitHubReposPanel) con { repoUrl, branch } en el state de navegación.
  // Debe declararse antes del early-return de abajo: los hooks no pueden llamarse condicionalmente.
  useEffect(() => {
      const prefill = location.state;
      if (!prefill?.repoUrl) return;
      setMode('git');
      setFormData(f => ({ ...f, repoUrl: prefill.repoUrl }));
      loadBranches(prefill.repoUrl, prefill.branch);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // CRÍTICO: no renderizar nada mientras carga
  if (loading) return null;
  if (!user) return null;

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
        const response = await fetch('/api/deploy', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });
        if (!response.ok) throw new Error(d.toasts.server_error);
        setProgress(100);
        setSuccessUrl(`https://${formData.subdomain}.stardest.com`);
        setShowRocketLaunch(true);
        setTimeout(() => {
          setShowRocketLaunch(false);
          setPhase('success');
          setWebhookInfo({
            subdomain: formData.subdomain,
            repoUrl: formData.repoUrl,
          });
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

  // ── Upload helpers ──
  const validateUploadSubdomain = (val) => {
    if (!val) return u.validation.no_sub;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(val)) return u.validation.invalid;
    if (val.length > 40) return u.validation.too_long;
    return '';
  };

  const handleUploadSubdomainChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setUploadSubdomain(val);
    setUploadSubdomainError(validateUploadSubdomain(val));
  };

  const addEntryToZip = (zip, entry, basePath = '') => {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file((file) => { zip.file(basePath + file.name, file); resolve(); }, reject);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries) => {
          for (const child of entries) {
            await addEntryToZip(zip, child, basePath + entry.name + '/');
          }
          resolve();
        }, reject);
      } else {
        resolve();
      }
    });
  };

  const buildZipFromItems = async (items) => {
    const zip = new JSZip();
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;
      if (entry.isDirectory) {
        const reader = entry.createReader();
        await new Promise((resolve, reject) => {
          reader.readEntries(async (entries) => {
            for (const child of entries) {
              await addEntryToZip(zip, child, '');
            }
            resolve();
          }, reject);
        });
      } else {
        await addEntryToZip(zip, entry, '');
      }
    }
    return zip.generateAsync({ type: 'blob' });
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!uploadSubdomain || validateUploadSubdomain(uploadSubdomain)) {
      showToast(d.upload.invalid_subdomain_drop, 'warning');
      return;
    }

    const items = Array.from(e.dataTransfer.items || []);
    const files = Array.from(e.dataTransfer.files || []);

    if (files.length === 0) return;

    // Check if it is a single ZIP file
    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      setUploadFile(files[0]);
      showToast('Archivo ZIP detectado y cargado.', 'success');
      return;
    }

    // Otherwise, we zip it on the client
    showToast('Comprimiendo carpeta/archivos en tu navegador...', 'info');
    try {
      const zipBlob = await buildZipFromItems(items);
      const zippedFile = new File([zipBlob], `${uploadSubdomain}.zip`, { type: 'application/zip' });
      setUploadFile(zippedFile);
      showToast(d.upload.folder_compressed, 'success');
    } catch (err) {
      console.error('Error comprimiendo archivos:', err);
      showToast('Error al comprimir archivos: ' + err.message, 'error');
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.name.endsWith('.zip') || file.type === 'application/zip') {
        setUploadFile(file);
      } else {
        showToast('Por favor selecciona un archivo .zip o arrastra una carpeta.', 'warning');
      }
    }
  };

  const handleUploadFormSubmit = (e) => {
    e.preventDefault();
    if (!uploadFile) { showToast(u.validation.no_file, 'warning'); return; }
    const err = validateUploadSubdomain(uploadSubdomain);
    if (err) { setUploadSubdomainError(err); return; }
    setUploadPhase('confirm');
  };

  const startUploadDeploy = async () => {
    setUploadPhase('progress');
    setUploadLogLines([]);
    setUploadProgress(0);
    uploadTimerRefs.current.forEach(clearTimeout);
    uploadTimerRefs.current = [];

    u.logs.forEach(({ delay, text, color }) => {
      const timer = setTimeout(() => {
        setUploadLogLines(prev => [...prev, { text, color }]);
        setUploadProgress(Math.min((delay / 11300) * 90, 90));
      }, delay);
      uploadTimerRefs.current.push(timer);
    });

    const finalTimer = setTimeout(async () => {
      try {
        const formPayload = new FormData();
        formPayload.append('file', uploadFile, `${uploadSubdomain}.zip`);
        formPayload.append('subdomain', uploadSubdomain);

        const response = await fetch('/api/deploy/upload', {
          method: 'POST',
          credentials: 'include',
          body: formPayload,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || data.details || data.error || 'Error del servidor');
        }

        setUploadProgress(100);
        setUploadSuccessUrl(`https://${uploadSubdomain}.stardest.com`);
        setShowRocketLaunch(true);
        setTimeout(() => {
          setShowRocketLaunch(false);
          setUploadPhase('success');
        }, 3200);
      } catch (err) {
        setUploadErrorMsg(err.message);
        setUploadPhase('error');
        showToast('Error: ' + err.message, 'error');
      }
    }, 11500);
    uploadTimerRefs.current.push(finalTimer);
  };

  const resetUpload = () => {
    uploadTimerRefs.current.forEach(clearTimeout);
    setUploadFile(null);
    setUploadSubdomain('');
    setUploadSubdomainError('');
    setUploadPhase('form');
    setUploadProgress(0);
    setUploadLogLines([]);
    setUploadSuccessUrl('');
    setUploadErrorMsg('');
  };

  const parsedRepo = parseGithubUrl(formData.repoUrl);
  const u = t.deploy.upload;

  // ===== DESIGN CONSTANTS =====
  const pageBg = 'var(--px-bg)';
  const pageTextColor = 'var(--px-white)';
  const cardBg = isDark ? 'rgba(16, 16, 18, 0.82)' : 'rgba(255, 255, 255, 0.82)';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const cardShadow = isDark ? '0 8px 32px rgba(0,0,0,0.55)' : '0 8px 32px rgba(0,0,0,0.1)';

  const textTitle = 'var(--px-white)';
  const textMuted = 'var(--px-muted)';
  const labelColor = 'var(--px-muted)';

  // Input styles
  const inputBg = 'var(--px-bg)';
  const inputColor = 'var(--px-white)';
  const inputBorder = 'var(--px-border)';
  const inputShadow = 'none';
  const inputRadius = 10;

  // Button styles
  const btnGradient = 'var(--px-accent)';
  const btnShadow = 'none';
  const btnRadius = 10;

  // Card radius
  const cardRadius = 16;

  // ===== RENDER =====
  return (
    <div className="relative min-h-screen overflow-x-hidden page-transition" style={{ backgroundColor: pageBg, color: pageTextColor }}>

      {/* Fondo animado de puntos */}
      <DotCloud isDark={isDark} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 pt-28 pb-20">

        {/* Header */}
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40, position: 'relative', zIndex: 2 }}>
          <span className="swiss-index" style={{ display: 'block', marginBottom: 12 }}>{d.badge}</span>
          <h1 style={{
            fontFamily: "'Inter',sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(28px, 5vw, 44px)',
            color: textTitle,
            margin: '0 0 8px',
            lineHeight: 1,
            textTransform: 'none',
            letterSpacing: '-0.03em',
          }}>
            {d.title_1} {d.title_2}
          </h1>
          <p style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: 16,
            color: textMuted,
            margin: 0,
          }}>{d.subtitle}</p>
        </div>

        <div className="w-full max-w-2xl fade-up fade-up-1" style={{ position: 'relative', zIndex: 2 }}>
          <div className="p-5 sm:p-8" style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: cardRadius,
            boxShadow: cardShadow,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}>

            {/* ── Tab switcher ── */}
            {(phase === 'form' || uploadPhase === 'form') && (
              <div style={{
                display: 'flex',
                gap: 4,
                marginBottom: 32,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                borderRadius: 12,
                padding: 4,
              }}>
                {[
                  { id: 'git',    label: u.tab_git,    icon: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' },
                  { id: 'upload', label: u.tab_upload, icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
                ].map(tab => {
                  const isActive = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      onClick={() => { setMode(tab.id); if (tab.id === 'git') resetUpload(); else reset(); }}
                      className="px-2 py-2 sm:px-4 sm:py-2.5"
                      style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 16px',
                        borderRadius: 9,
                        background: isActive
                          ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
                          : 'transparent',
                        border: 'none',
                        color: isActive ? 'var(--px-white)' : textMuted,
                        fontFamily: "'Inter',sans-serif",
                        fontWeight: 700,
                        fontSize: 'clamp(12px, 3.5vw, 13px)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.23,1,0.32,1)',
                        boxShadow: isActive
                          ? (isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)')
                          : 'none',
                      }}
                    >
                      <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill={tab.id === 'git' ? 'currentColor' : 'none'} stroke={tab.id === 'upload' ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={tab.icon} />
                      </svg>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ======= GIT MODE PHASES ======= */}
            {mode === 'git' && phase === 'form' && (
              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Repo URL */}
                <div>
                  <label style={{
                    display: 'block',
                    fontFamily: "'Inter',sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: labelColor,
                    marginBottom: 8,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>{d.form.repo_label}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder={d.form.repo_placeholder}
                      value={formData.repoUrl}
                      onChange={e => setFormData(f => ({ ...f, repoUrl: e.target.value }))}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--px-border-glow)';
                        e.target.style.boxShadow = '0 0 0 1px var(--px-border-glow), inset 0 0 12px rgba(128,128,128,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = inputBorder;
                        e.target.style.boxShadow = inputShadow;
                      }}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: inputBg,
                        border: `1px solid ${inputBorder}`,
                        color: inputColor,
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: inputShadow,
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        width: '100%',
                        borderRadius: inputRadius,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => loadBranches()}
                      disabled={loadingBranches}
                      onMouseEnter={(e) => {
                        if (!loadingBranches) {
                          e.currentTarget.style.opacity = '0.85';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      style={{
                        padding: '12px 20px',
                        background: btnGradient,
                        border: '1px solid var(--px-accent)',
                        color: 'var(--px-accent-fg)',
                        fontFamily: "'Inter',sans-serif",
                        fontSize: 16,
                        letterSpacing: '0.05em',
                        cursor: loadingBranches ? 'not-allowed' : 'pointer',
                        boxShadow: btnShadow,
                        transition: 'all 0.15s ease',
                        opacity: loadingBranches ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                        borderRadius: `0 ${btnRadius}px ${btnRadius}px 0`,
                      }}
                    >
                      {loadingBranches ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <div style={{ width: 12, height: 12, border: '1px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          {d.form.loading}
                        </span>
                      ) : d.form.load_branches}
                    </button>
                  </div>
                  {parsedRepo && (
                    <p style={{ fontSize: 13, color: isDark ? 'var(--px-white)' : 'var(--px-white)', marginTop: 6, margin: '6px 0 0', fontFamily: "'Inter',sans-serif" }}>
                      {d.form.repo_hint} <strong>{parsedRepo.owner}/{parsedRepo.repo}</strong>
                    </p>
                  )}
                </div>

                {/* Branch */}
                {branches.length > 0 && (
                  <div>
                    <label style={{
                      display: 'block',
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      color: labelColor,
                      marginBottom: 8,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>{d.form.branch_label}</label>
                    <select
                      value={formData.branch}
                      onChange={e => setFormData(f => ({ ...f, branch: e.target.value }))}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--px-border-glow)';
                        e.target.style.boxShadow = '0 0 0 1px var(--px-border-glow), inset 0 0 12px rgba(128,128,128,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = inputBorder;
                        e.target.style.boxShadow = inputShadow;
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: inputBg,
                        border: `1px solid ${inputBorder}`,
                        color: inputColor,
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: inputShadow,
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        borderRadius: inputRadius,
                      }}
                    >
                      {branches.map(b => <option key={b} value={b} style={{ background: inputBg, color: inputColor }}>{b}</option>)}
                    </select>
                  </div>
                )}

                {/* Subdomain */}
                <div>
                  <label style={{
                    display: 'block',
                    fontFamily: "'Inter',sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: labelColor,
                    marginBottom: 8,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>{d.form.subdomain_label}</label>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <input
                      type="text"
                      placeholder={d.form.subdomain_ph}
                      value={formData.subdomain}
                      onChange={handleSubdomainChange}
                      onFocus={(e) => {
                        e.target.style.borderColor = subdomainError ? '#ef4444' : 'var(--px-border-glow)';
                        e.target.style.boxShadow = subdomainError ? '0 0 0 1px #ef4444' : '0 0 0 1px var(--px-border-glow), inset 0 0 12px rgba(128,128,128,0.08)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = subdomainError ? '#ef4444' : inputBorder;
                        e.target.style.boxShadow = inputShadow;
                      }}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: inputBg,
                        border: `1px solid ${subdomainError ? '#ef4444' : inputBorder}`,
                        color: inputColor,
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 14,
                        outline: 'none',
                        boxShadow: inputShadow,
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        borderRadius: `${inputRadius}px 0 0 ${inputRadius}px`,
                      }}
                    />
                    <span className="px-2 sm:px-4 py-3" style={{
                      background: isDark ? 'var(--px-bg2)' : 'var(--px-white)',
                      border: `1px solid ${inputBorder}`,
                      borderLeft: 'none',
                      color: textMuted,
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                      borderRadius: `0 ${inputRadius}px ${inputRadius}px 0`,
                    }}>
                      {d.form.subdomain_suffix}
                    </span>
                  </div>
                  {subdomainError
                    ? <p style={{ fontSize: 13, color: isDark ? '#fca5a5' : '#ef4444', marginTop: 6, margin: '6px 0 0', fontFamily: "'Inter',sans-serif" }}>{subdomainError}</p>
                    : formData.subdomain && (
                      <p style={{ fontSize: 13, color: isDark ? 'var(--px-white)' : 'var(--px-white)', marginTop: 6, margin: '6px 0 0', fontFamily: "'Inter',sans-serif" }}>
                        {d.form.subdomain_url} <strong>https://{formData.subdomain}.stardest.com</strong>
                      </p>
                    )
                  }
                </div>

                <button
                  type="submit"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.88';
                    e.currentTarget.style.transform = 'scale(1.01)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: btnGradient,
                    border: '1px solid var(--px-accent)',
                    color: 'var(--px-accent-fg)',
                    fontFamily: "'Inter',sans-serif",
                    fontSize: 18,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    boxShadow: btnShadow,
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    textTransform: 'uppercase',
                    borderRadius: btnRadius,
                    transform: 'scale(1)',
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
            {mode === 'git' && phase === 'confirm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 26, color: textTitle, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{d.confirm.title}</h2>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: textMuted, margin: 0 }}>{d.confirm.sub}</p>
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
                      background: inputBg,
                      border: `1px solid ${inputBorder}`,
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 14,
                      borderRadius: 12,
                    }}>
                      <span style={{ color: textMuted }}>{label}</span>
                      <span style={{ color: accent ? (isDark ? 'var(--px-white)' : 'var(--px-white)') : pageTextColor, fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setPhase('form')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--px-border-glow)';
                      e.currentTarget.style.color = 'var(--px-white)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = inputBorder;
                      e.currentTarget.style.color = textMuted;
                      e.currentTarget.style.boxShadow = btnShadow;
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      background: 'transparent',
                      border: `1px solid ${inputBorder}`,
                      color: textMuted,
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: btnShadow,
                      transition: 'all 0.15s ease',
                      borderRadius: 10,
                    }}
                  >
                    {d.confirm.edit}
                  </button>
                  <button
                    onClick={startDeploy}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.85';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      background: btnGradient,
                      border: '1px solid var(--px-accent)',
                      color: 'var(--px-accent-fg)',
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: btnShadow,
                      transition: 'all 0.15s ease',
                      fontWeight: 'bold',
                      borderRadius: btnRadius,
                    }}
                  >
                    {d.confirm.confirm}
                  </button>
                </div>
              </div>
            )}

            {/* ======= PROGRESS ======= */}
            {mode === 'git' && phase === 'progress' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 22, color: textTitle, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{d.progress.title}</h2>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: textMuted, margin: '4px 0 0' }}>{formData.subdomain}.stardest.com</p>
                  </div>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, color: textTitle, fontWeight: 'bold' }}>{Math.round(progress)}%</span>
                </div>

                <div style={{
                  width: '100%',
                  height: 14,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  padding: 2,
                  boxSizing: 'border-box',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: 'repeating-linear-gradient(90deg, var(--px-border-glow) 0px, var(--px-border-glow) 6px, var(--px-white) 6px, var(--px-white) 8px)',
                      transition: 'width 0.4s cubic-bezier(0.23,1,0.32,1)',
                      borderRadius: 99,
                    }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
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
                        border: `1px solid ${done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBorder}`,
                        background: done ? 'rgba(16,185,129,0.1)' : active ? 'rgba(128,128,128,0.15)' : 'transparent',
                        fontFamily: "'Inter',sans-serif",
                        fontSize: 13,
                        flex: 1,
                        textAlign: 'center',
                        borderRadius: 12,
                      }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 6,
                          background: done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBg,
                          border: `1px solid ${done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBorder}`,
                        }}>
                          {done
                            ? <svg style={{ width: 14, height: 14, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                            : active
                              ? <div style={{ width: 10, height: 10, border: '1px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                              : <div style={{ width: 6, height: 6, background: inputBorder }} />
                          }
                        </div>
                        <span style={{ color: done ? '#10b981' : active ? pageTextColor : textMuted, fontWeight: 'bold' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>

                <div ref={logRef} className="px-terminal" style={{
                  height: 200,
                  overflowY: 'auto',
                  boxSizing: 'border-box',
                  fontSize: 12,
                }}>
                  {logLines.map((line, i) => (
                    <p key={i} className={line.color} style={{ margin: '0 0 6px', lineHeight: 1.4 }}>{line.text}</p>
                  ))}
                  <p style={{ margin: 0, color: 'var(--px-border-glow)', animation: 'px-blink 1s steps(1) infinite' }}>█</p>
                </div>
              </div>
            )}

            {/* ======= SUCCESS ======= */}
            {mode === 'git' && phase === 'success' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: 'transparent',
                  border: '1px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  borderRadius: 999,
                }}>
                  <svg style={{ width: 28, height: 28, color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 28, color: textTitle, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{d.success.title}</h2>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: textMuted, margin: '0 0 28px' }}>{d.success.sub}</p>

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
                      background: inputBg,
                      border: `1px solid ${inputBorder}`,
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 14,
                      borderRadius: 12,
                    }}>
                      <span style={{ color: textMuted }}>{label}</span>
                      <span style={{ color: green ? '#10b981' : pageTextColor, fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <a
                    href={successUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      borderRadius: btnRadius,
                      background: 'transparent',
                      border: '1px solid #10b981',
                      color: '#10b981',
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 13,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      textDecoration: 'none',
                      transition: 'opacity 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontWeight: 700,
                      boxSizing: 'border-box',
                    }}
                  >
                    <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    {d.success.open}
                  </a>
                  <button
                    onClick={reset}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--px-border-glow)';
                      e.currentTarget.style.color = 'var(--px-white)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = inputBorder;
                      e.currentTarget.style.color = textMuted;
                      e.currentTarget.style.boxShadow = btnShadow;
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: 'transparent',
                      border: `1px solid ${inputBorder}`,
                      color: textMuted,
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: btnShadow,
                      transition: 'all 0.15s ease',
                      borderRadius: 10,
                    }}
                  >
                    {d.success.new_deploy}
                  </button>
                </div>
              </div>
            )}

            {/* ======= ERROR ======= */}
            {mode === 'git' && phase === 'error' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: 'transparent',
                  border: '1px solid var(--px-red)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  borderRadius: 999,
                }}>
                  <svg style={{ width: 28, height: 28, color: 'var(--px-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 28, color: textTitle, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{d.error.title}</h2>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: isDark ? '#fca5a5' : '#b91c1c', margin: '0 0 28px' }}>{errorMessage}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    onClick={startDeploy}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.85';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      background: btnGradient,
                      border: '1px solid var(--px-accent)',
                      color: 'var(--px-accent-fg)',
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 18,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      boxShadow: btnShadow,
                      transition: 'all 0.15s ease',
                      fontWeight: 'bold',
                      borderRadius: btnRadius,
                    }}
                  >
                    {d.error.retry}
                  </button>
                  <button
                    onClick={reset}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--px-border-glow)';
                      e.currentTarget.style.color = 'var(--px-white)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = inputBorder;
                      e.currentTarget.style.color = textMuted;
                      e.currentTarget.style.boxShadow = btnShadow;
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: 'transparent',
                      border: `1px solid ${inputBorder}`,
                      color: textMuted,
                      fontFamily: "'Inter',sans-serif",
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: btnShadow,
                      transition: 'all 0.15s ease',
                      borderRadius: 10,
                    }}
                  >
                    {d.error.modify}
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                UPLOAD MODE PHASES
            ═══════════════════════════════════════════════════ */}
            {mode === 'upload' && (
              <>
                {/* ── Upload FORM ── */}
                {uploadPhase === 'form' && (
                  <form onSubmit={handleUploadFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Drag & Drop Zone */}
                    <div>
                      <label style={{
                        display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600,
                        color: labelColor, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>ZIP</label>
                      <div
                        id="upload-dropzone"
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleFileDrop}
                        onClick={() => !uploadFile && fileInputRef.current?.click()}
                        style={{
                          border: `2px dashed ${isDragOver ? 'var(--px-accent)' : uploadFile ? '#10b981' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')}`,
                          background: isDragOver
                            ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
                            : uploadFile
                              ? (isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.05)')
                              : 'transparent',
                          borderRadius: 14,
                          padding: '36px 24px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                          cursor: uploadFile ? 'default' : 'pointer',
                          transition: 'all 0.2s ease',
                          textAlign: 'center',
                          boxShadow: isDragOver ? `0 0 0 2px var(--px-border-glow)` : 'none',
                        }}
                      >
                        {uploadFile ? (
                          <>
                            <svg style={{ width: 32, height: 32, color: '#10b981', marginBottom: 4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#10b981' }}>
                              {u.file_selected} <strong>{uploadFile.name}</strong>
                            </span>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: textMuted }}>
                              {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setUploadFile(null); if(fileInputRef.current) fileInputRef.current.value=''; }}
                              style={{
                                marginTop: 4, padding: '4px 14px',
                                background: 'transparent', border: `1px solid ${inputBorder}`,
                                color: textMuted, fontFamily: "'Inter',sans-serif", fontSize: 14,
                                cursor: 'pointer', letterSpacing: '0.04em',
                                borderRadius: 8,
                              }}
                            >{u.file_change}</button>
                          </>
                        ) : (
                          <>
                            <svg style={{ width: 36, height: 36, color: isDark ? 'var(--px-border-glow)' : 'var(--px-muted)', marginBottom: 4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, color: isDark ? 'var(--px-white)' : 'var(--px-white)' }}>
                              {u.drop_title}
                            </span>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: textMuted }}>
                              {u.drop_or}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                              style={{
                                padding: '8px 20px',
                                background: btnGradient, border: '1px solid var(--px-accent)',
                                color: 'var(--px-accent-fg)', fontFamily: "'Inter',sans-serif",
                                fontSize: 15, cursor: 'pointer', boxShadow: btnShadow,
                                letterSpacing: '0.04em',
                                borderRadius: btnRadius,
                              }}
                            >{u.drop_btn}</button>
                            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: textMuted }}>
                              {u.drop_hint}
                            </span>
                          </>
                        )}
                        <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileInput} style={{ display: 'none' }} />
                      </div>
                    </div>

                    {/* Subdomain */}
                    <div>
                      <label style={{
                        display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600,
                        color: labelColor, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>{u.subdomain_label}</label>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        <input
                          id="upload-subdomain"
                          type="text"
                          placeholder={u.subdomain_ph}
                          value={uploadSubdomain}
                          onChange={handleUploadSubdomainChange}
                          onFocus={(e) => {
                            e.target.style.borderColor = uploadSubdomainError ? '#ef4444' : 'var(--px-border-glow)';
                            e.target.style.boxShadow = uploadSubdomainError ? '0 0 0 1px #ef4444' : '0 0 0 1px var(--px-border-glow)';
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = uploadSubdomainError ? '#ef4444' : inputBorder;
                            e.target.style.boxShadow = inputShadow;
                          }}
                          style={{
                            flex: 1, padding: '12px 16px',
                            background: inputBg, border: `1px solid ${uploadSubdomainError ? '#ef4444' : inputBorder}`,
                            color: inputColor, fontFamily: "'JetBrains Mono',monospace",
                            fontSize: 14, outline: 'none', boxShadow: inputShadow,
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            borderRadius: `${inputRadius}px 0 0 ${inputRadius}px`,
                          }}
                        />
                        <span style={{
                          padding: '12px 16px',
                          background: isDark ? 'var(--px-bg2)' : 'var(--px-white)',
                          border: `1px solid ${inputBorder}`, borderLeft: 'none',
                          color: textMuted, fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 14, display: 'flex', alignItems: 'center',
                          borderRadius: `0 ${inputRadius}px ${inputRadius}px 0`,
                        }}>{u.subdomain_suffix}</span>
                      </div>
                      {uploadSubdomainError
                        ? <p style={{ fontSize: 13, color: '#fca5a5', margin: '6px 0 0', fontFamily: "'Inter',sans-serif" }}>{uploadSubdomainError}</p>
                        : uploadSubdomain && (
                          <p style={{ fontSize: 13, color: isDark ? 'var(--px-white)' : 'var(--px-white)', margin: '6px 0 0', fontFamily: "'Inter',sans-serif" }}>
                            {u.subdomain_url} <strong>https://{uploadSubdomain}.stardest.com</strong>
                          </p>
                        )
                      }
                    </div>

                    <button
                      type="submit"
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                      style={{
                        width: '100%', padding: '14px 24px',
                        background: btnGradient, border: '1px solid var(--px-accent)',
                        color: 'var(--px-accent-fg)', fontFamily: "'Inter',sans-serif",
                        fontSize: 18, letterSpacing: '0.08em', cursor: 'pointer',
                        boxShadow: btnShadow, transition: 'all 0.15s ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        textTransform: 'uppercase',
                        borderRadius: btnRadius,
                      }}
                    >
                      {u.submit}
                      <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </form>
                )}

                {/* ── Upload CONFIRM ── */}
                {uploadPhase === 'confirm' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 26, color: textTitle, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{u.confirm_title}</h2>
                      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: textMuted, margin: 0 }}>{u.confirm_sub}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: u.confirm_file, value: uploadFile?.name },
                        { label: u.confirm_url,  value: `https://${uploadSubdomain}.stardest.com`, accent: true },
                      ].map(({ label, value, accent }) => (
                        <div key={label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', background: inputBg, border: `1px solid ${inputBorder}`,
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 14,
                          borderRadius: 12,
                        }}>
                          <span style={{ color: textMuted }}>{label}</span>
                          <span style={{ color: accent ? (isDark ? 'var(--px-white)' : 'var(--px-white)') : pageTextColor, fontWeight: 'bold' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => setUploadPhase('form')}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.color = 'var(--px-white)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.color = textMuted; }}
                        style={{ flex: 1, padding: '12px 20px', background: 'transparent', border: `1px solid ${inputBorder}`, color: textMuted, fontFamily: "'Inter',sans-serif", fontSize: 16, cursor: 'pointer', boxShadow: btnShadow, transition: 'all 0.15s ease', borderRadius: 10 }}
                      >{u.confirm_edit}</button>
                      <button
                        onClick={startUploadDeploy}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        style={{ flex: 1, padding: '12px 20px', background: btnGradient, border: '1px solid var(--px-accent)', color: 'var(--px-accent-fg)', fontFamily: "'Inter',sans-serif", fontSize: 16, cursor: 'pointer', boxShadow: btnShadow, transition: 'all 0.15s ease', fontWeight: 'bold', borderRadius: btnRadius }}
                      >{u.confirm_btn}</button>
                    </div>
                  </div>
                )}

                {/* ── Upload PROGRESS ── */}
                {uploadPhase === 'progress' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 22, color: textTitle, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{u.progress_title}</h2>
                        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: textMuted, margin: '4px 0 0' }}>{uploadSubdomain}.stardest.com</p>
                      </div>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, color: textTitle, fontWeight: 'bold' }}>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div style={{ width: '100%', height: 14, background: inputBg, border: `1px solid ${inputBorder}`, padding: 2, boxSizing: 'border-box', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'repeating-linear-gradient(90deg,var(--px-border-glow) 0px,var(--px-border-glow) 6px,var(--px-white) 6px,var(--px-white) 8px)', transition: 'width 0.4s cubic-bezier(0.23,1,0.32,1)', borderRadius: 99 }} />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      {[
                        { key: 'uploading',  label: u.uploading,  threshold: 30  },
                        { key: 'building',   label: u.building,   threshold: 65  },
                        { key: 'publishing', label: u.publishing, threshold: 90  },
                      ].map(({ key, label, threshold }) => {
                        const done   = uploadProgress >= threshold;
                        const active = uploadProgress > threshold - 30 && uploadProgress < threshold;
                        return (
                          <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 8px', border: `1px solid ${done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBorder}`, background: done ? 'rgba(16,185,129,0.1)' : active ? 'rgba(128,128,128,0.15)' : 'transparent', fontFamily: "'Inter',sans-serif", fontSize: 13, flex: 1, textAlign: 'center', borderRadius: 12 }}>
                            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBg, border: `1px solid ${done ? '#10b981' : active ? 'var(--px-border-glow)' : inputBorder}` }}>
                              {done ? <svg style={{ width: 14, height: 14, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                   : active ? <div style={{ width: 10, height: 10, border: '1px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                   : <div style={{ width: 6, height: 6, background: inputBorder }} />}
                            </div>
                            <span style={{ color: done ? '#10b981' : active ? pageTextColor : textMuted, fontWeight: 'bold' }}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div ref={uploadLogRef} className="px-terminal" style={{
                      height: 200,
                      overflowY: 'auto',
                      boxSizing: 'border-box',
                      fontSize: 12,
                    }}>
                      {uploadLogLines.map((line, i) => (
                        <p key={i} className={line.color} style={{ margin: '0 0 6px', lineHeight: 1.4 }}>{line.text}</p>
                      ))}
                      <p style={{ margin: 0, color: 'var(--px-border-glow)', animation: 'px-blink 1s steps(1) infinite' }}>█</p>
                    </div>
                  </div>
                )}

                {/* ── Upload SUCCESS ── */}
                {uploadPhase === 'success' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 999, background: 'transparent', border: '1px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                      <svg style={{ width: 28, height: 28, color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 28, color: textTitle, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{u.success_title}</h2>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: textMuted, margin: '0 0 28px' }}>{u.success_sub}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
                      {[
                        { label: u.success_file,   value: uploadFile?.name },
                        { label: u.success_status, value: u.success_status_v, green: true },
                      ].map(({ label, value, green }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: inputBg, border: `1px solid ${inputBorder}`, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, borderRadius: 12 }}>
                          <span style={{ color: textMuted }}>{label}</span>
                          <span style={{ color: green ? '#10b981' : pageTextColor, fontWeight: 'bold' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <a
                        href={uploadSuccessUrl} target="_blank" rel="noopener noreferrer"
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        style={{ width: '100%', padding: '14px 24px', borderRadius: btnRadius, background: 'transparent', border: '1px solid #10b981', color: '#10b981', fontFamily: "'Inter',sans-serif", fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', transition: 'opacity 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, boxSizing: 'border-box' }}
                      >
                        <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        {u.success_open}
                      </a>
                      <button
                        onClick={resetUpload}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.color = 'var(--px-white)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.color = textMuted; }}
                        style={{ width: '100%', padding: '12px 24px', background: 'transparent', border: `1px solid ${inputBorder}`, color: textMuted, fontFamily: "'Inter',sans-serif", fontSize: 16, cursor: 'pointer', boxShadow: btnShadow, transition: 'all 0.15s ease', borderRadius: 10 }}
                      >{u.success_new}</button>
                    </div>
                  </div>
                )}

                {/* ── Upload ERROR ── */}
                {uploadPhase === 'error' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, background: 'transparent', border: '1px solid var(--px-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', borderRadius: 999 }}>
                      <svg style={{ width: 28, height: 28, color: 'var(--px-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 28, color: textTitle, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{u.error_title}</h2>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: isDark ? '#fca5a5' : '#b91c1c', margin: '0 0 28px' }}>{uploadErrorMsg}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <button
                        onClick={startUploadDeploy}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        style={{ width: '100%', padding: '14px 24px', background: btnGradient, border: '1px solid var(--px-accent)', color: 'var(--px-accent-fg)', fontFamily: "'Inter',sans-serif", fontSize: 18, letterSpacing: '0.08em', cursor: 'pointer', boxShadow: btnShadow, transition: 'all 0.15s ease', fontWeight: 'bold', borderRadius: btnRadius }}
                      >{u.error_retry}</button>
                      <button
                        onClick={resetUpload}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.color = 'var(--px-white)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.color = textMuted; }}
                        style={{ width: '100%', padding: '12px 24px', background: 'transparent', border: `1px solid ${inputBorder}`, color: textMuted, fontFamily: "'Inter',sans-serif", fontSize: 16, cursor: 'pointer', boxShadow: btnShadow, transition: 'all 0.15s ease', borderRadius: 10 }}
                      >{u.error_modify}</button>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      {/* ======= TOASTS ======= */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(toast => {
          const cfg = {
            success: { bg: 'var(--px-surface)', border: '#10b981', text: '#10b981', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /> },
            error:   { bg: 'var(--px-surface)', border: 'var(--px-red)', text: 'var(--px-red)', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /> },
            warning: { bg: 'var(--px-surface)', border: '#f59e0b', text: '#f59e0b', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /> },
            info:    { bg: 'var(--px-surface)', border: 'var(--px-border)', text: 'var(--px-white)', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          }[toast.type] || {};
          return (
            <div key={toast.id} className="animate-fade-in" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 10,
              minWidth: 280,
              maxWidth: 380,
              fontFamily: "'Inter',sans-serif",
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

      {/* ======= DEPLOY OVERLAY ======= */}
      {showRocketLaunch && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--px-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            color: 'var(--px-white)',
            animation: 'deploy-check-pop 0.4s ease-out forwards',
          }}>
            <CheckCircleIcon size={72} />
          </div>

          <div style={{
            fontFamily: "'Inter',sans-serif",
            fontWeight: 700,
            fontSize: 22,
            color: 'var(--px-white)',
            marginTop: 24,
            textAlign: 'center',
          }}>
            {d.progress.title}
          </div>
        </div>
      )}
      {/* ======= WEBHOOK INSTRUCTIONS MODAL ======= */}
      {webhookInfo && (
        <WebhookInstructions
          subdomain={webhookInfo.subdomain}
          repoUrl={webhookInfo.repoUrl}
          onClose={() => setWebhookInfo(null)}
        />
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes deploy-check-pop {
          0% { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
