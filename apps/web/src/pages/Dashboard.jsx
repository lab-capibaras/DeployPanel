// Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function timeAgo(dateStr) {
    if (!dateStr || dateStr === 'unknown') return 'Fecha desconocida';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'Hace un momento';
    if (mins < 60)  return `Hace ${mins} min`;
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
}

function repoShort(url) {
    if (!url || url === 'unknown') return 'Desconocido';
    const match = url.match(/github\.com\/(.+?)(?:\.git)?$/);
    return match ? match[1] : url;
}

const STATUS_COLOR = {
    running:    { bg: 'rgba(0,200,100,0.15)',  border: 'rgba(0,200,100,0.4)',  dot: '#00c864', label: 'Running'    },
    restarting: { bg: 'rgba(255,180,0,0.15)',  border: 'rgba(255,180,0,0.4)',  dot: '#ffb400', label: 'Restarting' },
    exited:     { bg: 'rgba(255,60,60,0.15)',  border: 'rgba(255,60,60,0.4)',  dot: '#ff3c3c', label: 'Stopped'    },
};

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [deploys, setDeploys]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [deleting, setDeleting] = useState(null);

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
        if (!confirm(`¿Eliminar ${subdomain}.stardest.com?`)) return;
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

    if (authLoading || loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: "'Jersey 10', monospace", color: '#00d4ff', fontSize: 18 }}>Cargando...</p>
        </div>
    );

    if (!user) return null;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontFamily: "'Jersey 10', monospace", fontSize: 28, color: '#e8eeff', margin: 0 }}>
                        Mis Deploys
                    </h1>
                    <p style={{ fontFamily: "'Jersey 10', monospace", fontSize: 14, color: 'rgba(200,216,255,0.5)', margin: '4px 0 0' }}>
                        {deploys.length} proyecto{deploys.length !== 1 ? 's' : ''} activo{deploys.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <Link
                    to="/deploy"
                    style={{
                        fontFamily: "'Jersey 10', monospace", fontSize: 16,
                        padding: '10px 20px',
                        background: 'rgba(0,212,255,0.1)',
                        border: '1px solid rgba(0,212,255,0.3)',
                        color: '#00d4ff',
                        textDecoration: 'none',
                    }}
                >
                    + Nuevo Deploy
                </Link>
            </div>

            {/* Lista vacía */}
            {deploys.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '60px 24px',
                    border: '1px solid rgba(47,74,103,0.4)',
                    background: 'rgba(11,15,25,0.6)',
                }}>
                    <p style={{ fontFamily: "'Jersey 10', monospace", fontSize: 18, color: 'rgba(200,216,255,0.4)', margin: 0 }}>
                        No tienes deploys aún
                    </p>
                    <Link to="/deploy" style={{ fontFamily: "'Jersey 10', monospace", fontSize: 15, color: '#00d4ff', marginTop: 12, display: 'inline-block' }}>
                        Crear tu primer deploy →
                    </Link>
                </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {deploys.map(deploy => {
                    const s = STATUS_COLOR[deploy.status] || STATUS_COLOR.exited;
                    const url = `https://${deploy.subdomain}.stardest.com`;
                    return (
                        <div
                            key={deploy.subdomain}
                            style={{
                                padding: '20px 24px',
                                background: 'rgba(11,15,25,0.8)',
                                border: '1px solid rgba(47,74,103,0.4)',
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
                                boxShadow: `0 0 8px ${s.dot}`,
                            }} />

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <span style={{ fontFamily: "'Jersey 10', monospace", fontSize: 18, color: '#e8eeff', fontWeight: 700 }}>
                                        {deploy.subdomain}
                                    </span>
                                    <span style={{
                                        fontFamily: "'Jersey 10', monospace", fontSize: 12,
                                        padding: '2px 8px',
                                        background: s.bg, border: `1px solid ${s.border}`,
                                        color: s.dot,
                                    }}>
                                        {s.label}
                                    </span>
                                </div>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontFamily: 'monospace', fontSize: 13, color: '#00d4ff', textDecoration: 'none', display: 'block', marginBottom: 4 }}
                                >
                                    {url}
                                </a>
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: "'Jersey 10', monospace", fontSize: 12, color: 'rgba(200,216,255,0.4)' }}>
                                        📦 {repoShort(deploy.repo)}
                                    </span>
                                    <span style={{ fontFamily: "'Jersey 10', monospace", fontSize: 12, color: 'rgba(200,216,255,0.4)' }}>
                                        🌿 {deploy.branch}
                                    </span>
                                    <span style={{ fontFamily: "'Jersey 10', monospace", fontSize: 12, color: 'rgba(200,216,255,0.4)' }}>
                                        🕐 {timeAgo(deploy.deployedAt)}
                                    </span>
                                </div>
                            </div>

                            {/* Acciones */}
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        fontFamily: "'Jersey 10', monospace", fontSize: 14,
                                        padding: '8px 16px',
                                        background: 'rgba(0,212,255,0.08)',
                                        border: '1px solid rgba(0,212,255,0.25)',
                                        color: '#00d4ff', textDecoration: 'none',
                                    }}
                                >
                                    Visitar →
                                </a>
                                <button
                                    onClick={() => handleDelete(deploy.subdomain)}
                                    disabled={deleting === deploy.subdomain}
                                    style={{
                                        fontFamily: "'Jersey 10', monospace", fontSize: 14,
                                        padding: '8px 16px',
                                        background: 'rgba(255,60,60,0.08)',
                                        border: '1px solid rgba(255,60,60,0.25)',
                                        color: deleting === deploy.subdomain ? 'rgba(255,60,60,0.4)' : '#ff3c3c',
                                        cursor: deleting === deploy.subdomain ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {deleting === deploy.subdomain ? '...' : 'Eliminar'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
