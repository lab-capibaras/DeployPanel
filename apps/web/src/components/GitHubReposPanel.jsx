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

function timeAgo(dateStr, dash) {
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

// ─── Sub-componente: lista de repos (usada tanto para "Mis Repos" como para los repos de una org) ──

function RepoList({ repos, deployedSet, loading, error, dash }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all'); // all | deployed | available | private | public

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

    if (loading) return (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--px-muted)', fontSize: 14 }}>
            {dash.gh_repos_loading}
        </div>
    );

    if (error) return (
        <div style={{ padding: 20, borderRadius: 'var(--px-radius)', border: '1px solid var(--px-border)', color: '#ef4444', fontSize: 14 }}>
            {error}
        </div>
    );

    return (
        <div>
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

            {filtered.length === 0 ? (
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
                                            {timeAgo(repo.pushedAt, dash)}
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

// ─── Sub-componente: tarjeta de organización ─────────────────────────────────

function OrgCard({ org, onClick, dash }) {
    return (
        <div
            onClick={() => onClick(org)}
            className="px-card"
            style={{
                padding: 20, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, textAlign: 'center',
            }}
        >
            <img
                src={org.avatarUrl}
                alt={org.login}
                style={{ width: 64, height: 64, borderRadius: 'var(--px-radius)', objectFit: 'cover', border: '1px solid var(--px-border)' }}
                onError={e => { e.target.style.display = 'none'; }}
            />
            <div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--px-white)', marginBottom: 4 }}>
                    {org.name || org.login}
                </div>
                {org.description && (
                    <div style={{
                        fontFamily: "'Inter',sans-serif",
                        fontSize: 12, color: 'var(--px-muted)',
                        maxWidth: 160,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                        {org.description}
                    </div>
                )}
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--px-muted)', marginTop: 6 }}>
                    {dash.gh_orgs_public_repos(org.publicRepos)}
                </div>
            </div>
        </div>
    );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function GitHubReposPanel({ deployedRepos = [] }) {
    const dash = useTranslation().dashboard;
    const [tab, setTab] = useState('repos'); // 'repos' | 'orgs'

    // Estado: mis repos
    const [myRepos, setMyRepos]       = useState([]);
    const [myLoading, setMyLoading]   = useState(true);
    const [myError, setMyError]       = useState('');
    const [hasToken, setHasToken]     = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Estado: organizaciones
    const [orgs, setOrgs]               = useState([]);
    const [orgsLoading, setOrgsLoading] = useState(false);
    const [orgsLoaded, setOrgsLoaded]   = useState(false);
    const [orgsError, setOrgsError]     = useState('');

    // Estado: repos de la org seleccionada
    const [selectedOrg, setSelectedOrg]         = useState(null);
    const [orgRepos, setOrgRepos]               = useState([]);
    const [orgReposLoading, setOrgReposLoading] = useState(false);
    const [orgReposError, setOrgReposError]     = useState('');

    const deployedSet = useMemo(() => new Set(deployedRepos), [deployedRepos]);

    // Cargar mis repos al montar (y al refrescar)
    useEffect(() => {
        setMyLoading(true);
        setMyError('');
        fetch('/api/github-repos', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.repos) { setMyRepos(data.repos); setHasToken(data.hasToken); }
                else setMyError(data.error || dash.gh_repos_err_load);
            })
            .catch(() => setMyError(dash.gh_repos_err_network))
            .finally(() => setMyLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    // Cargar orgs cuando el usuario cambia a esa pestaña (lazy, solo una vez)
    function handleTabOrgs() {
        setTab('orgs');
        if (orgsLoaded) return;
        setOrgsLoading(true);
        fetch('/api/github-orgs', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.orgs) setOrgs(data.orgs);
                else setOrgsError(data.error || dash.gh_orgs_err_load);
                setOrgsLoaded(true);
            })
            .catch(() => setOrgsError(dash.gh_repos_err_network))
            .finally(() => setOrgsLoading(false));
    }

    // Cargar repos de una org al hacer clic en su tarjeta
    function handleOrgClick(org) {
        setSelectedOrg(org);
        setOrgRepos([]);
        setOrgReposError('');
        setOrgReposLoading(true);
        fetch(`/api/github-org-repos?org=${encodeURIComponent(org.login)}`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.repos) setOrgRepos(data.repos);
                else setOrgReposError(data.error || dash.gh_org_repos_err_load);
            })
            .catch(() => setOrgReposError(dash.gh_repos_err_network))
            .finally(() => setOrgReposLoading(false));
    }

    const tabStyle = (active) => ({
        fontFamily: "'Inter',sans-serif",
        padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        borderRadius: 'var(--px-radius-sm)', border: '1px solid var(--px-border)',
        background: active ? 'var(--px-accent)' : 'transparent',
        color: active ? 'var(--px-accent-fg)' : 'var(--px-muted)',
        transition: 'all 0.15s ease',
        textTransform: 'uppercase', letterSpacing: '0.04em',
    });

    return (
        <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setTab('repos')} style={tabStyle(tab === 'repos')}>
                        {dash.gh_repos_tab}
                    </button>
                    <button onClick={handleTabOrgs} style={tabStyle(tab === 'orgs')}>
                        {dash.gh_orgs_tab}
                    </button>
                </div>
                {tab === 'repos' && (
                    <button
                        onClick={() => setRefreshKey(k => k + 1)}
                        disabled={myLoading}
                        style={{
                            padding: '6px 14px', fontSize: 13, cursor: myLoading ? 'not-allowed' : 'pointer',
                            border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                            background: 'transparent', color: 'var(--px-muted)',
                            opacity: myLoading ? 0.6 : 1,
                        }}
                    >
                        ↻ {dash.gh_repos_refresh}
                    </button>
                )}
            </div>

            {!hasToken && (
                <div style={{
                    padding: '10px 16px', marginBottom: 16,
                    border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                    background: 'var(--px-surface)', fontSize: 13,
                    color: 'var(--px-muted)',
                }}>
                    {dash.gh_connect_hint_full}
                </div>
            )}

            {tab === 'repos' && (
                <RepoList
                    repos={myRepos}
                    deployedSet={deployedSet}
                    loading={myLoading}
                    error={myError}
                    dash={dash}
                />
            )}

            {tab === 'orgs' && (
                <div>
                    {selectedOrg ? (
                        <div>
                            <button
                                onClick={() => { setSelectedOrg(null); setOrgRepos([]); }}
                                style={{
                                    fontFamily: "'Inter',sans-serif",
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    marginBottom: 20, padding: '6px 14px',
                                    border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-sm)',
                                    background: 'transparent', color: 'var(--px-muted)',
                                    fontSize: 13, cursor: 'pointer',
                                }}
                            >
                                {dash.gh_orgs_back}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <img
                                    src={selectedOrg.avatarUrl}
                                    alt={selectedOrg.login}
                                    style={{ width: 40, height: 40, borderRadius: 'var(--px-radius-sm)', border: '1px solid var(--px-border)' }}
                                />
                                <div>
                                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--px-white)' }}>
                                        {selectedOrg.name || selectedOrg.login}
                                    </div>
                                    {selectedOrg.description && (
                                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--px-muted)' }}>
                                            {selectedOrg.description}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <RepoList
                                repos={orgRepos}
                                deployedSet={deployedSet}
                                loading={orgReposLoading}
                                error={orgReposError}
                                dash={dash}
                            />
                        </div>
                    ) : orgsLoading ? (
                        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--px-muted)', fontSize: 14 }}>
                            {dash.gh_orgs_loading}
                        </div>
                    ) : orgsError ? (
                        <div style={{ padding: 20, borderRadius: 'var(--px-radius)', border: '1px solid var(--px-border)', color: '#ef4444', fontSize: 14 }}>
                            {orgsError}
                        </div>
                    ) : orgs.length === 0 ? (
                        <div style={{
                            padding: 32, textAlign: 'center',
                            border: '1px solid var(--px-border)', borderRadius: 'var(--px-radius-lg)',
                            background: 'var(--px-surface)',
                            color: 'var(--px-muted)', fontSize: 14,
                        }}>
                            {dash.gh_orgs_empty}{!hasToken && dash.gh_orgs_empty_hint}
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: 12,
                        }}>
                            {orgs.map(org => (
                                <OrgCard key={org.login} org={org} onClick={handleOrgClick} dash={dash} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
