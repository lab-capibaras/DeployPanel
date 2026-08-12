// GitHubReposPanel.jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';

const LANGUAGE_COLORS = {
    JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3776ab',
    PHP: '#777bb4', 'C#': '#239120', Java: '#b07219', Go: '#00add8',
    Rust: '#dea584', Ruby: '#cc342d', Swift: '#ffac45', Kotlin: '#7f52ff',
    Vue: '#41b883', CSS: '#1572b6', HTML: '#e34c26',
};

export default function GitHubReposPanel({ deployedRepos = [] }) {
    const navigate = useNavigate();
    const dash = useTranslation().dashboard;

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diff / 86400000);
        if (days === 0) return dash.gh_repos_today;
        if (days === 1) return dash.gh_repos_yesterday;
        if (days < 30) return dash.gh_repos_days(days);
        const months = Math.floor(days / 30);
        if (months < 12) return dash.gh_repos_months(months);
        return dash.gh_repos_years(Math.floor(months / 12));
    }

    const [repos, setRepos]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [hasToken, setHasToken] = useState(false);
    const [search, setSearch]     = useState('');
    const [filter, setFilter]     = useState('all'); // all | deployed | available | private | public
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        setLoading(true);
        setError('');
        fetch('/api/github-repos', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.repos) {
                    setRepos(data.repos);
                    setHasToken(data.hasToken);
                } else {
                    setError(data.error || dash.gh_repos_err_load);
                }
            })
            .catch(() => setError(dash.gh_repos_err_network))
            .finally(() => setLoading(false));
    }, [refreshKey]);

    const deployedSet = useMemo(() => new Set(deployedRepos), [deployedRepos]);

    const filtered = useMemo(() => {
        let list = repos;

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(r =>
                r.name.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q)
            );
        }

        switch (filter) {
            case 'deployed':  list = list.filter(r => deployedSet.has(r.url)); break;
            case 'available': list = list.filter(r => !deployedSet.has(r.url)); break;
            case 'private':   list = list.filter(r => r.private); break;
            case 'public':    list = list.filter(r => !r.private); break;
        }

        return list;
    }, [repos, search, filter, deployedSet]);

    function handleDeploy(repo) {
        navigate('/deploy', { state: { repoUrl: repo.url, branch: repo.defaultBranch } });
    }

    const filterLabels = {
        all: dash.gh_repos_filter_all,
        available: dash.gh_repos_filter_available,
        deployed: dash.gh_repos_filter_deployed,
        public: dash.gh_repos_filter_public,
        private: dash.gh_repos_filter_private,
    };

    return (
        <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--px-white)', margin: 0 }}>
                        {dash.gh_repos_title}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--px-muted)', margin: '4px 0 0' }}>
                        {dash.gh_repos_count(repos.length)}
                        {!hasToken && (
                            <span style={{ marginLeft: 8, color: 'var(--px-white)' }}>
                                · {dash.gh_repos_connect_hint}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setRefreshKey(k => k + 1)}
                    disabled={loading}
                    style={{
                        padding: '6px 14px', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                        background: 'transparent', color: 'var(--px-muted)',
                        opacity: loading ? 0.6 : 1,
                    }}
                >
                    ↻ {dash.gh_repos_refresh}
                </button>
            </div>

            {!loading && !error && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={dash.gh_repos_search_placeholder}
                        style={{
                            flex: 1, minWidth: 200,
                            padding: '10px 14px', fontSize: 14,
                            border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                            background: 'var(--px-bg)', color: 'var(--px-white)',
                            outline: 'none',
                        }}
                    />
                    {['all', 'available', 'deployed', 'public', 'private'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                                borderRadius: 'var(--px-radius-sm)', border: '1px solid var(--px-border)',
                                background: filter === f ? 'var(--px-accent)' : 'transparent',
                                color: filter === f ? 'var(--px-accent-fg)' : 'var(--px-muted)',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>
            )}

            {loading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--px-muted)', fontSize: 14 }}>
                    {dash.gh_repos_loading}
                </div>
            ) : error ? (
                <div style={{ padding: 20, borderRadius: 'var(--px-radius)', border: '1px solid var(--px-border)', color: '#ef4444', fontSize: 14 }}>
                    {error}
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    padding: 32, textAlign: 'center',
                    border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-lg)',
                    background: 'var(--px-surface)',
                    color: 'var(--px-muted)', fontSize: 14,
                }}>
                    {dash.gh_repos_empty}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.map(repo => {
                        const isDeployed = deployedSet.has(repo.url);
                        return (
                            <div
                                key={repo.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: '16px 20px',
                                    border: '1px solid var(--px-border)',
                                    borderRadius: 'var(--px-radius)',
                                    background: 'var(--px-surface)',
                                    flexWrap: 'wrap',
                                    transition: 'border-color 0.2s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--px-border-glow)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--px-border)'; }}
                            >
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                        <a
                                            href={repo.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="swiss-link"
                                            style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--px-white)' }}
                                        >
                                            {repo.fullName}
                                        </a>
                                        {repo.private && (
                                            <span style={{
                                                fontFamily: "'JetBrains Mono',monospace",
                                                fontSize: 11, padding: '2px 7px',
                                                border: '1px solid var(--px-border)',
                                                borderRadius: 'var(--px-radius-sm)', color: 'var(--px-muted)',
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>
                                                {dash.gh_repos_private}
                                            </span>
                                        )}
                                        {isDeployed && (
                                            <span style={{
                                                fontFamily: "'JetBrains Mono',monospace",
                                                fontSize: 11, padding: '2px 7px',
                                                border: '1px solid rgba(16,185,129,0.4)',
                                                borderRadius: 'var(--px-radius-sm)', color: '#10b981',
                                                background: 'rgba(16,185,129,0.08)',
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>
                                                ✓ {dash.gh_repos_deployed}
                                            </span>
                                        )}
                                    </div>
                                    {repo.description && (
                                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--px-muted)', margin: '0 0 6px' }}>
                                            {repo.description}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        {repo.language && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                                <span style={{
                                                    width: 8, height: 8, borderRadius: '50%',
                                                    background: LANGUAGE_COLORS[repo.language] || 'var(--px-border-glow)',
                                                    display: 'inline-block',
                                                }} />
                                                {repo.language}
                                            </span>
                                        )}
                                        {repo.stars > 0 && (
                                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                                ★ {repo.stars}
                                            </span>
                                        )}
                                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)' }}>
                                            {timeAgo(repo.pushedAt)}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleDeploy(repo)}
                                    style={{
                                        fontFamily: "'Inter',sans-serif",
                                        padding: '9px 18px', fontSize: 12, fontWeight: 600,
                                        borderRadius: 'var(--px-radius-sm)', cursor: 'pointer',
                                        background: isDeployed ? 'transparent' : 'var(--px-accent)',
                                        color: isDeployed ? 'var(--px-muted)' : 'var(--px-accent-fg)',
                                        border: isDeployed ? '1px solid var(--px-border)' : 'none',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap',
                                        textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}
                                >
                                    {isDeployed ? dash.gh_repos_redeploy : dash.gh_repos_deploy}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
