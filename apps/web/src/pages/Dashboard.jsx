// Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import { CopyIcon, CheckIcon } from '../components/Icons';

function timeAgo(dateStr, dash) {
    if (!dateStr || dateStr === 'unknown') return dash.unknown_date;
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return dash.time_now;
    if (mins < 60)  return dash.time_min(mins);
    if (hours < 24) return dash.time_hour(hours);
    return dash.time_day(days);
}

function repoShort(url, dash) {
    if (!url || url === 'unknown') return dash.unknown_repo;
    const match = url.match(/github\.com\/(.+?)(?:\.git)?$/);
    return match ? match[1] : url;
}

const STATUS_COLOR = {
    running:    { dot: '#00c864' },
    restarting: { dot: '#ffb400' },
    exited:     { dot: '#ff3c3c' },
};

const REDEPLOY_COOLDOWN_MS = 60000;

function GitHubTokenSection() {
    const [status, setStatus]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken]     = useState('');
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetch('/api/github-token/status', { credentials: 'include' })
            .then(r => r.json())
            .then(data => setStatus(data.connected ? 'connected' : 'disconnected'))
            .catch(() => setStatus('disconnected'))
            .finally(() => setLoading(false));
    }, []);

    async function handleSave() {
        if (!token.trim()) return;
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const res = await fetch('/api/github-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ githubToken: token.trim() }),
            });
            const data = await res.json();
            if (data.ok) {
                setStatus('connected');
                setToken('');
                setSuccess(data.githubUsername ? `Conectado como @${data.githubUsername}` : 'Token guardado correctamente');
            } else {
                setError(data.error || 'Error guardando el token');
            }
        } catch (e) {
            setError('Error de red');
        } finally {
            setSaving(false);
        }
    }

    async function handleDisconnect() {
        await fetch('/api/github-token', { method: 'DELETE', credentials: 'include' });
        setStatus('disconnected');
        setSuccess('');
    }

    if (loading) return null;

    return (
        <div style={{
            padding: 24, borderRadius: 'var(--px-radius-lg)',
            border: '1px solid var(--px-border)', background: 'var(--px-surface)',
            marginBottom: 32,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--px-white)', margin: 0 }}>
                        Repositorios privados de GitHub
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--px-muted)', margin: '4px 0 0' }}>
                        Conecta tu cuenta para desplegar repos privados automáticamente.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: status === 'connected' ? '#22c55e' : 'var(--px-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'connected' ? '#22c55e' : 'var(--px-border)', flexShrink: 0 }} />
                    {status === 'connected' ? 'Conectado' : 'No conectado'}
                </div>
            </div>

            {status === 'connected' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--px-muted)' }}>
                        Token guardado. Tus deploys usarán este token automáticamente.
                    </span>
                    <button onClick={handleDisconnect} style={{
                        padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                        border: '1px solid var(--px-border)', borderRadius: 8,
                        background: 'transparent', color: 'var(--px-muted)',
                    }}>
                        Desconectar
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="password"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            style={{
                                flex: 1, padding: '10px 14px', fontSize: 14,
                                border: '1px solid var(--px-border)', borderRadius: 8,
                                background: 'var(--px-bg)', color: 'var(--px-white)', outline: 'none',
                            }}
                        />
                        <button onClick={handleSave} disabled={saving || !token.trim()} style={{
                            padding: '10px 20px', fontSize: 14, fontWeight: 600,
                            background: 'var(--px-blue)', color: '#fff',
                            border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving || !token.trim() ? 0.5 : 1,
                        }}>
                            {saving ? 'Guardando...' : 'Guardar token'}
                        </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--px-faint)', margin: 0 }}>
                        Genera tu token en{' '}
                        <a href="https://github.com/settings/tokens/new?scopes=repo&description=StarDest"
                            target="_blank" rel="noreferrer" style={{ color: 'var(--px-blue)' }}>
                            github.com/settings/tokens
                        </a>
                        {' '}con el permiso <code>repo</code> activado.
                    </p>
                    {error && <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>}
                </div>
            )}
            {success && <p style={{ fontSize: 13, color: '#22c55e', margin: '8px 0 0' }}>{success}</p>}
        </div>
    );
}

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const t = useTranslation();
    const dash = t.dashboard;
    const [deploys, setDeploys]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [redeploying, setRedeploying] = useState({});
    const [cooldowns, setCooldowns] = useState({});
    const [now, setNow] = useState(Date.now());
    const [showDb, setShowDb] = useState({});
    const [copiedField, setCopiedField] = useState(null);

    function copyField(fieldKey, value) {
        navigator.clipboard.writeText(String(value));
        setCopiedField(fieldKey);
        setTimeout(() => setCopiedField(prev => (prev === fieldKey ? null : prev)), 2000);
    }

    useEffect(() => {
        if (!authLoading && !user) navigate('/login');
    }, [user, authLoading, navigate]);

    useEffect(() => {
        if (!user) return;
        fetch('/api/deploys', {
            credentials: 'include'
        })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') setDeploys(data.deploys);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    async function handleDelete(subdomain) {
        if (!confirm(dash.confirm_delete(subdomain))) return;
        setDeleting(subdomain);
        try {
            const res = await fetch(`/api/deploy/${subdomain}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
                setDeploys(prev => prev.filter(d => d.subdomain !== subdomain));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(null);
        }
    }

    useEffect(() => {
        const hasActiveCooldown = Object.values(cooldowns).some(expiry => expiry > now);
        if (!hasActiveCooldown) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [cooldowns, now]);

    async function handleRedeploy(deploy) {
        if (deploy.repo === 'unknown' || deploy.repo === 'zip-upload') return;
        if (cooldowns[deploy.subdomain] > Date.now()) return;

        setRedeploying(prev => ({ ...prev, [deploy.subdomain]: true }));

        try {
            const res = await fetch('/api/deploy', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    repoUrl: deploy.repo,
                    subdomain: deploy.subdomain,
                    branch: deploy.branch === 'unknown' ? 'main' : deploy.branch
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                setDeploys(prev => prev.map(d =>
                    d.subdomain === deploy.subdomain
                        ? { ...d, deployedAt: data.deployedAt }
                        : d
                ));
            }
        } catch (err) {
            console.error('Error en redeploy:', err);
        } finally {
            setRedeploying(prev => ({ ...prev, [deploy.subdomain]: false }));
            setCooldowns(prev => ({ ...prev, [deploy.subdomain]: Date.now() + REDEPLOY_COOLDOWN_MS }));
        }
    }

    if (authLoading || loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: "'Inter',sans-serif", color: 'var(--px-muted)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dash.loading}</p>
        </div>
    );

    if (!user) return null;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

            {/* Header */}
            <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 16, paddingBottom: 24 }}>
                <div>
                    <span className="swiss-index" style={{ display: 'block', marginBottom: 4 }}>{dash.title}</span>
                    <h1 style={{
                        fontFamily: "'Inter',sans-serif", fontWeight: 900,
                        fontSize: 'clamp(32px, 7vw, 64px)', color: 'var(--px-white)',
                        margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1,
                    }}>
                        {dash.title}
                    </h1>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--px-muted)', margin: '12px 0 0' }}>
                        {String(deploys.length).padStart(2, '0')} — {deploys.length !== 1 ? dash.projects_many : dash.projects_one}
                    </p>
                </div>
                <Link
                    to="/deploy"
                    className="px-btn"
                    style={{
                        textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: 13, padding: '14px 28px',
                    }}
                >
                    {dash.new_deploy}
                </Link>
            </div>
            <span className="swiss-line" style={{ marginBottom: 40 }} />

            <GitHubTokenSection />

            {/* Lista vacía */}
            {deploys.length === 0 && (
                <div className="fade-up fade-up-1" style={{
                    textAlign: 'center', padding: '80px 24px',
                    border: '1px solid var(--px-border)',
                    borderRadius: 'var(--px-radius-lg)',
                    background: 'var(--px-surface)',
                    boxShadow: 'var(--px-shadow-sm)',
                }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 48, height: 48, borderRadius: '50%',
                        border: '1px solid var(--px-border)', background: 'var(--px-bg)',
                        fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14,
                        color: 'var(--px-muted)', marginBottom: 20,
                    }}>00</span>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-muted)', margin: '0 0 16px' }}>
                        {dash.empty}
                    </p>
                    <Link to="/deploy" className="swiss-link" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--px-white)' }}>
                        {dash.create_first}
                    </Link>
                </div>
            )}

            {/* Lista */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {deploys.map((deploy, idx) => {
                    const s = STATUS_COLOR[deploy.status] || STATUS_COLOR.exited;
                    const statusLabel = dash.status[deploy.status] || dash.status.exited;
                    const url = `https://${deploy.subdomain}.stardest.com`;
                    return (
                        <div
                            key={deploy.subdomain}
                            className={`fade-up fade-up-${Math.min(idx + 1, 4)}`}
                            style={{
                                padding: '24px 28px',
                                border: '1px solid var(--px-border)',
                                borderRadius: 'var(--px-radius-lg)',
                                background: 'var(--px-surface)',
                                boxShadow: 'var(--px-shadow-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 20,
                                flexWrap: 'wrap',
                                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.boxShadow = 'var(--px-shadow-md)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; e.currentTarget.style.boxShadow = 'var(--px-shadow-sm)'; }}
                        >
                            {/* Index number */}
                            <span style={{
                                fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
                                color: 'var(--px-muted)', flexShrink: 0, minWidth: 28,
                            }}>
                                {String(idx + 1).padStart(2, '0')}
                            </span>

                            {/* Status dot */}
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: s.dot, flexShrink: 0,
                                boxShadow: `0 0 6px ${s.dot}55`,
                            }} />

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, color: 'var(--px-white)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                                        {deploy.subdomain}
                                    </span>
                                    <span style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 10,
                                        padding: '3px 10px',
                                        border: `1px solid ${s.dot}40`,
                                        background: `${s.dot}12`,
                                        borderRadius: 999,
                                        color: s.dot,
                                        textTransform: 'uppercase', letterSpacing: '0.08em',
                                    }}>
                                        {statusLabel}
                                    </span>
                                </div>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="swiss-link"
                                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--px-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}
                                >
                                    {url}
                                </a>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                        {repoShort(deploy.repo, dash)}
                                    </span>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                        {deploy.branch}
                                    </span>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                        {timeAgo(deploy.deployedAt, dash)}
                                    </span>
                                </div>
                            </div>

                            {/* Acciones */}
                            <div className="w-full sm:w-auto" style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 sm:flex-none"
                                    style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12,
                                        padding: '9px 16px',
                                        background: 'transparent',
                                        border: '1px solid var(--px-border)',
                                        borderRadius: 'var(--px-radius-sm)',
                                        color: 'var(--px-white)', textDecoration: 'none',
                                        textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em',
                                        transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.background = 'var(--px-bg)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {dash.visit}
                                </a>
                                {deploy.repo !== 'unknown' && deploy.repo !== 'zip-upload' && (() => {
                                    const isRedeploying = redeploying[deploy.subdomain];
                                    const cooldownLeft = Math.ceil(((cooldowns[deploy.subdomain] || 0) - now) / 1000);
                                    const onCooldown = cooldownLeft > 0;
                                    const disabled = isRedeploying || onCooldown;
                                    return (
                                        <button
                                            onClick={() => handleRedeploy(deploy)}
                                            disabled={disabled}
                                            className="flex-1 sm:flex-none"
                                            style={{
                                                fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12,
                                                padding: '9px 16px',
                                                background: 'transparent',
                                                border: '1px solid var(--px-border)',
                                                borderRadius: 'var(--px-radius-sm)',
                                                color: disabled ? 'var(--px-muted)' : 'var(--px-white)',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                                transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
                                                opacity: disabled ? 0.5 : 1,
                                            }}
                                            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; e.currentTarget.style.color = 'var(--px-white)'; } }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; e.currentTarget.style.color = disabled ? 'var(--px-muted)' : 'var(--px-white)'; }}
                                        >
                                            {isRedeploying
                                                ? dash.redeploying
                                                : onCooldown
                                                    ? dash.redeploy_cooldown(cooldownLeft)
                                                    : dash.redeploy}
                                        </button>
                                    );
                                })()}
                                <button
                                    onClick={() => handleDelete(deploy.subdomain)}
                                    disabled={deleting === deploy.subdomain}
                                    className="flex-1 sm:flex-none"
                                    style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12,
                                        padding: '9px 16px',
                                        background: 'rgba(255,43,0,0.06)',
                                        border: '1px solid rgba(255,43,0,0.25)',
                                        borderRadius: 'var(--px-radius-sm)',
                                        color: deleting === deploy.subdomain ? 'var(--px-muted)' : 'var(--px-red)',
                                        cursor: deleting === deploy.subdomain ? 'not-allowed' : 'pointer',
                                        textTransform: 'uppercase', letterSpacing: '0.05em',
                                        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                                        opacity: deleting === deploy.subdomain ? 0.5 : 1,
                                    }}
                                    onMouseEnter={e => { if (deleting !== deploy.subdomain) { e.currentTarget.style.background = 'var(--px-red)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'var(--px-red)'; } }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,43,0,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,43,0,0.25)'; e.currentTarget.style.color = deleting === deploy.subdomain ? 'var(--px-muted)' : 'var(--px-red)'; }}
                                >
                                    {deleting === deploy.subdomain ? dash.deleting : dash.delete}
                                </button>
                            </div>

                            {/* DB Credentials */}
                            {deploy.database && (
                                <div style={{ width: '100%', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--px-border)' }}>
                                    <button
                                        onClick={() => setShowDb(prev => ({ ...prev, [deploy.subdomain]: !prev[deploy.subdomain] }))}
                                        style={{
                                            fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11,
                                            padding: '7px 14px',
                                            background: 'rgba(255,180,0,0.08)',
                                            border: '1px solid rgba(255,180,0,0.3)',
                                            borderRadius: 'var(--px-radius-sm)',
                                            color: '#ffb400',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                            transition: 'background 0.15s ease, color 0.15s ease',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#ffb400'; e.currentTarget.style.color = '#000'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,180,0,0.08)'; e.currentTarget.style.color = '#ffb400'; }}
                                    >
                                        {showDb[deploy.subdomain] ? dash.db_hide : dash.db_show}
                                    </button>

                                    {showDb[deploy.subdomain] && (() => {
                                        const db = deploy.database;
                                        const url = db.type === 'mysql'
                                            ? `mysql://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`
                                            : `postgresql://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`;
                                        const rows = [
                                            [dash.db_type, db.type.toUpperCase()],
                                            [dash.db_host, db.host],
                                            [dash.db_port, db.port],
                                            [dash.db_name, db.name],
                                            [dash.db_user, db.user],
                                            [dash.db_pass, db.password],
                                        ];
                                        const copyBtnStyle = (active) => ({
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 10,
                                            padding: '4px 8px',
                                            background: active ? 'rgba(16,185,129,0.12)' : 'transparent',
                                            border: `1px solid ${active ? 'rgba(16,185,129,0.4)' : 'var(--px-border)'}`,
                                            borderRadius: 'var(--px-radius-sm)',
                                            color: active ? '#10b981' : 'var(--px-muted)',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase', letterSpacing: '0.04em',
                                            whiteSpace: 'nowrap',
                                            transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                                        });
                                        return (
                                            <div style={{ marginTop: 10, border: '1px solid var(--px-border)', borderTop: '2px solid #ffb400', borderRadius: 'var(--px-radius)' }}>
                                                {rows.map(([label, value]) => {
                                                    const fieldKey = `${deploy.subdomain}-${label}`;
                                                    const isCopied = copiedField === fieldKey;
                                                    return (
                                                        <div key={label} style={{
                                                            display: 'grid', gridTemplateColumns: '140px 1fr auto',
                                                            alignItems: 'center', gap: 8,
                                                            padding: '8px 14px', borderBottom: '1px solid var(--px-border)',
                                                        }}>
                                                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                                                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-white)', wordBreak: 'break-all' }}>{value}</span>
                                                            <button
                                                                onClick={() => copyField(fieldKey, value)}
                                                                style={copyBtnStyle(isCopied)}
                                                                title={dash.db_copy}
                                                            >
                                                                {isCopied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                                                                {isCopied ? dash.db_copied : dash.db_copy}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                                <div style={{ padding: '8px 14px' }}>
                                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>DATABASE_URL</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ffb400', wordBreak: 'break-all', flex: 1 }}>{url}</span>
                                                        <button
                                                            onClick={() => copyField(`${deploy.subdomain}-DATABASE_URL`, url)}
                                                            style={copyBtnStyle(copiedField === `${deploy.subdomain}-DATABASE_URL`)}
                                                            title={dash.db_copy}
                                                        >
                                                            {copiedField === `${deploy.subdomain}-DATABASE_URL` ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                                                            {copiedField === `${deploy.subdomain}-DATABASE_URL` ? dash.db_copied : dash.db_copy}
                                                        </button>
                                                    </div>
                                                </div>
                                                {db.adminerUrl && (
                                                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--px-border)' }}>
                                                        <a
                                                            href={db.adminerUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 8,
                                                                fontFamily: "'Inter',sans-serif",
                                                                fontWeight: 700,
                                                                fontSize: 12,
                                                                padding: '9px 16px',
                                                                background: 'transparent',
                                                                border: '1px solid #00c8ff',
                                                                color: '#00c8ff',
                                                                textDecoration: 'none',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.06em',
                                                                transition: 'background 0.15s ease, color 0.15s ease',
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#00c8ff'; e.currentTarget.style.color = '#000'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#00c8ff'; }}
                                                        >
                                                            {dash.db_adminer}
                                                        </a>
                                                        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-muted)', margin: '8px 0 0' }}>
                                                            {dash.db_hint(db.type === 'mysql' ? 'MySQL' : 'PostgreSQL')}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
