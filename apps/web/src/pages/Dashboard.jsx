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
    running:    { bg: 'rgba(0,200,100,0.12)',  border: 'rgba(0,200,100,0.35)',  dot: '#00c864' },
    restarting: { bg: 'rgba(255,180,0,0.12)',  border: 'rgba(255,180,0,0.35)',  dot: '#ffb400' },
    exited:     { bg: 'rgba(255,60,60,0.12)',  border: 'rgba(255,60,60,0.35)',  dot: '#ff3c3c' },
};

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const t = useTranslation();
    const dash = t.dashboard;
    const [deploys, setDeploys]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [redeploying, setRedeploying] = useState({});

    useEffect(() => {
        if (!authLoading && !user) navigate('/login');
    }, [user, authLoading, navigate]);

    useEffect(() => {
        if (!user) return;
        const token = localStorage.getItem('auth_token');
        fetch('/api/deploys', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
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

    async function handleRedeploy(deploy) {
        if (deploy.repo === 'unknown' || deploy.repo === 'zip-upload') return;

        setRedeploying(prev => ({ ...prev, [deploy.subdomain]: true }));

        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/deploy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
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
        }
    }

    if (authLoading || loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: "'Inter',sans-serif", color: 'var(--px-muted)', fontSize: 16 }}>{dash.loading}</p>
        </div>
    );

    if (!user) return null;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--px-white)', margin: 0 }}>
                        {dash.title}
                    </h1>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--px-muted)', margin: '4px 0 0' }}>
                        {deploys.length} {deploys.length !== 1 ? dash.projects_many : dash.projects_one}
                    </p>
                </div>
                <Link
                    to="/deploy"
                    className="px-btn"
                    style={{
                        textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: 14, padding: '10px 20px',
                    }}
                >
                    {dash.new_deploy}
                </Link>
            </div>

            {/* Lista vacía */}
            {deploys.length === 0 && (
                <div className="px-card" style={{
                    textAlign: 'center', padding: '60px 24px',
                }}>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-muted)', margin: 0 }}>
                        {dash.empty}
                    </p>
                    <Link to="/deploy" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--px-white)', marginTop: 12, display: 'inline-block' }}>
                        {dash.create_first}
                    </Link>
                </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {deploys.map(deploy => {
                    const s = STATUS_COLOR[deploy.status] || STATUS_COLOR.exited;
                    const statusLabel = dash.status[deploy.status] || dash.status.exited;
                    const url = `https://${deploy.subdomain}.stardest.com`;
                    return (
                        <div
                            key={deploy.subdomain}
                            className="px-card"
                            style={{
                                padding: '20px 24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                flexWrap: 'wrap',
                            }}
                        >
                            {/* Status dot */}
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: s.dot, flexShrink: 0,
                            }} />

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'var(--px-white)', fontWeight: 700 }}>
                                        {deploy.subdomain}
                                    </span>
                                    <span style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11,
                                        padding: '2px 8px', borderRadius: 6,
                                        background: s.bg, border: `1px solid ${s.border}`,
                                        color: s.dot,
                                    }}>
                                        {statusLabel}
                                    </span>
                                </div>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--px-white)', textDecoration: 'none', display: 'block', marginBottom: 4 }}
                                >
                                    {url}
                                </a>
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'var(--px-muted)' }}>
                                        📦 {repoShort(deploy.repo, dash)}
                                    </span>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'var(--px-muted)' }}>
                                        🌿 {deploy.branch}
                                    </span>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'var(--px-muted)' }}>
                                        🕐 {timeAgo(deploy.deployedAt, dash)}
                                    </span>
                                </div>
                            </div>

                            {/* Acciones */}
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-border"
                                    style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13,
                                        padding: '8px 16px', borderRadius: 8,
                                        background: 'var(--px-bg)',
                                        color: 'var(--px-white)', textDecoration: 'none',
                                    }}
                                >
                                    {dash.visit}
                                </a>
                                {deploy.repo !== 'unknown' && deploy.repo !== 'zip-upload' && (
                                    <button
                                        onClick={() => handleRedeploy(deploy)}
                                        disabled={redeploying[deploy.subdomain]}
                                        className="px-border"
                                        style={{
                                            fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13,
                                            padding: '8px 16px', borderRadius: 8,
                                            background: 'var(--px-bg)',
                                            color: redeploying[deploy.subdomain] ? 'var(--px-muted)' : 'var(--px-white)',
                                            cursor: redeploying[deploy.subdomain] ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            transition: 'opacity 0.15s ease',
                                            opacity: redeploying[deploy.subdomain] ? 0.6 : 1,
                                        }}
                                    >
                                        {redeploying[deploy.subdomain] ? dash.redeploying : dash.redeploy}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(deploy.subdomain)}
                                    disabled={deleting === deploy.subdomain}
                                    style={{
                                        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13,
                                        padding: '8px 16px', borderRadius: 8,
                                        background: 'rgba(255,60,60,0.08)',
                                        border: '1px solid rgba(255,60,60,0.25)',
                                        color: deleting === deploy.subdomain ? 'rgba(255,60,60,0.4)' : '#ff3c3c',
                                        cursor: deleting === deploy.subdomain ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {deleting === deploy.subdomain ? dash.deleting : dash.delete}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
