// Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';

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
                    <span className="swiss-index">{dash.title}</span>
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
            <span className="swiss-line swiss-line-red" style={{ marginBottom: 40 }} />

            {/* Lista vacía */}
            {deploys.length === 0 && (
                <div className="fade-up fade-up-1" style={{
                    textAlign: 'center', padding: '80px 24px',
                    border: '1px solid var(--px-border)',
                }}>
                    <span className="swiss-index" style={{ display: 'block', marginBottom: 16 }}>00</span>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {dash.empty}
                    </p>
                    <Link to="/deploy" className="swiss-link" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 14, color: 'var(--px-red)', marginTop: 16, display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {dash.create_first}
                    </Link>
                </div>
            )}

            {/* Lista */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {deploys.map((deploy, idx) => {
                    const s = STATUS_COLOR[deploy.status] || STATUS_COLOR.exited;
                    const statusLabel = dash.status[deploy.status] || dash.status.exited;
                    const url = `https://${deploy.subdomain}.stardest.com`;
                    return (
                        <div
                            key={deploy.subdomain}
                            className={`fade-up fade-up-${Math.min(idx + 1, 4)}`}
                            style={{
                                padding: '28px 0',
                                borderBottom: '1px solid var(--px-border)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 24,
                                flexWrap: 'wrap',
                            }}
                        >
                            {/* Index number */}
                            <span style={{
                                fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
                                color: 'var(--px-muted)', flexShrink: 0, minWidth: 28,
                            }}>
                                {String(idx + 1).padStart(2, '0')}
                            </span>

                            {/* Status square */}
                            <div style={{
                                width: 10, height: 10,
                                background: s.dot, flexShrink: 0,
                            }} />

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, color: 'var(--px-white)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                                        {deploy.subdomain}
                                    </span>
                                    <span style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 10,
                                        padding: '3px 8px',
                                        border: `1px solid ${s.dot}`,
                                        color: s.dot,
                                        textTransform: 'uppercase', letterSpacing: '0.1em',
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
                                    className="px-border flex-1 sm:flex-none"
                                    style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
                                        padding: '10px 18px',
                                        background: 'transparent',
                                        color: 'var(--px-white)', textDecoration: 'none',
                                        textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em',
                                        transition: 'border-color 0.15s ease, color 0.15s ease',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-red)'; e.currentTarget.style.color = 'var(--px-red)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; e.currentTarget.style.color = 'var(--px-white)'; }}
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
                                            className="px-border flex-1 sm:flex-none"
                                            style={{
                                                fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
                                                padding: '10px 18px',
                                                background: 'transparent',
                                                color: disabled ? 'var(--px-muted)' : 'var(--px-white)',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                                opacity: disabled ? 0.6 : 1,
                                            }}
                                            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--px-red)'; e.currentTarget.style.color = 'var(--px-red)'; } }}
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
                                        fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
                                        padding: '10px 18px',
                                        background: 'transparent',
                                        border: '1px solid var(--px-red)',
                                        color: deleting === deploy.subdomain ? 'var(--px-muted)' : 'var(--px-red)',
                                        cursor: deleting === deploy.subdomain ? 'not-allowed' : 'pointer',
                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                        transition: 'background 0.15s ease, color 0.15s ease',
                                    }}
                                    onMouseEnter={e => { if (deleting !== deploy.subdomain) { e.currentTarget.style.background = 'var(--px-red)'; e.currentTarget.style.color = '#ffffff'; } }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = deleting === deploy.subdomain ? 'var(--px-muted)' : 'var(--px-red)'; }}
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
                                            fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11,
                                            padding: '7px 14px',
                                            background: 'transparent',
                                            border: '1px solid #ffb400',
                                            color: '#ffb400',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#ffb400'; e.currentTarget.style.color = '#000'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ffb400'; }}
                                    >
                                        {showDb[deploy.subdomain] ? '− Ocultar DB' : '+ Ver credenciales DB'}
                                    </button>

                                    {showDb[deploy.subdomain] && (() => {
                                        const db = deploy.database;
                                        const url = db.type === 'mysql'
                                            ? `mysql://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`
                                            : `postgresql://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`;
                                        const rows = [
                                            ['Tipo', db.type.toUpperCase()],
                                            ['Host', db.host],
                                            ['Puerto', db.port],
                                            ['Base de datos', db.name],
                                            ['Usuario', db.user],
                                            ['Contraseña', db.password],
                                        ];
                                        return (
                                            <div style={{ marginTop: 10, border: '1px solid var(--px-border)', borderTop: '2px solid #ffb400' }}>
                                                {rows.map(([label, value]) => (
                                                    <div key={label} style={{
                                                        display: 'grid', gridTemplateColumns: '140px 1fr',
                                                        padding: '8px 14px', borderBottom: '1px solid var(--px-border)',
                                                    }}>
                                                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                                                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-white)', wordBreak: 'break-all' }}>{value}</span>
                                                    </div>
                                                ))}
                                                <div style={{ padding: '8px 14px' }}>
                                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--px-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>DATABASE_URL</span>
                                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ffb400', wordBreak: 'break-all' }}>{url}</span>
                                                </div>
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
