# Instrucciones: Panel de repos personales + organizaciones de GitHub

## Contexto

Extensión de `github-repos-panel.md`. Se divide el panel en dos pestañas:

1. **Mis Repos** — repos personales del usuario (ya implementado en `github-repos-panel.md`)
2. **Organizaciones** — grid de tarjetas con todas las organizaciones del usuario; al hacer clic en una tarjeta se despliegan los repos de esa organización

Requiere que el usuario tenga token de GitHub guardado para ver organizaciones privadas y repos privados de organizaciones. Sin token, solo muestra organizaciones públicas.

---

## PASO 1 — Backend: endpoints nuevos

En `deploy_panel/apps/builder/index.js`, agregar:

### 1a. Listar organizaciones del usuario

```javascript
// GET /github-orgs
// Lista todas las organizaciones del usuario autenticado
app.get('/github-orgs', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No autenticado' });

    let userId, userLogin;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id;
        userLogin = decoded.username || decoded.name;
    } catch (e) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    const githubToken = getUserToken(userId);
    const headers = {
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
    };

    try {
        // Con token: /user/orgs devuelve todas (públicas + privadas)
        // Sin token: /users/:login/orgs devuelve solo públicas
        const url = githubToken
            ? 'https://api.github.com/user/orgs?per_page=100'
            : `https://api.github.com/users/${userLogin}/orgs?per_page=100`;

        const response = await fetch(url, { headers });
        if (!response.ok) return res.status(response.status).json({ error: `GitHub API error: ${response.status}` });

        const orgs = await response.json();

        // Para cada org, obtener info detallada (avatar, descripción, etc.)
        const detailed = await Promise.all(orgs.map(async org => {
            try {
                const orgRes = await fetch(`https://api.github.com/orgs/${org.login}`, { headers });
                if (!orgRes.ok) return {
                    login: org.login,
                    avatarUrl: org.avatar_url,
                    description: '',
                    publicRepos: 0,
                };
                const orgData = await orgRes.json();
                return {
                    login:       orgData.login,
                    name:        orgData.name || orgData.login,
                    avatarUrl:   orgData.avatar_url,
                    description: orgData.description || '',
                    publicRepos: orgData.public_repos || 0,
                    url:         orgData.html_url,
                };
            } catch (e) {
                return {
                    login: org.login,
                    name: org.login,
                    avatarUrl: org.avatar_url,
                    description: '',
                    publicRepos: 0,
                    url: `https://github.com/${org.login}`,
                };
            }
        }));

        res.json({ orgs: detailed, hasToken: !!githubToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

### 1b. Listar repos de una organización

```javascript
// GET /github-org-repos?org=nombre
// Lista los repos de una organización específica
app.get('/github-org-repos', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No autenticado' });

    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    const { org } = req.query;
    if (!org || !/^[a-zA-Z0-9._-]+$/.test(org)) {
        return res.status(400).json({ error: 'Nombre de organización inválido' });
    }

    const githubToken = getUserToken(userId);
    const headers = {
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
    };

    try {
        let repos = [];
        let page = 1;
        while (true) {
            const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&sort=pushed&type=all`;
            const response = await fetch(url, { headers });
            if (!response.ok) break;

            const batch = await response.json();
            if (!Array.isArray(batch) || batch.length === 0) break;

            repos = repos.concat(batch);
            if (batch.length < 100) break;
            page++;
        }

        const formatted = repos.map(r => ({
            id:            r.id,
            name:          r.name,
            fullName:      r.full_name,
            url:           r.html_url,
            description:   r.description || '',
            private:       r.private,
            language:      r.language || null,
            pushedAt:      r.pushed_at,
            defaultBranch: r.default_branch,
            stars:         r.stargazers_count,
        }));

        res.json({ repos: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

---

## PASO 2 — Frontend: refactorizar en un componente con pestañas

Reemplazar el componente `GitHubReposPanel.jsx` con una versión que incluye pestañas **Mis Repos** y **Organizaciones**.

Crear `deploy_panel/apps/web/src/components/GitHubReposPanel.jsx` con el siguiente contenido completo:

```jsx
// GitHubReposPanel.jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `hace ${days} días`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
    return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) > 1 ? 's' : ''}`;
}

const LANGUAGE_COLORS = {
    JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3776ab',
    PHP: '#777bb4', 'C#': '#239120', Java: '#b07219', Go: '#00add8',
    Rust: '#dea584', Ruby: '#cc342d', Swift: '#ffac45', Kotlin: '#7f52ff',
    Vue: '#41b883', CSS: '#1572b6', HTML: '#e34c26',
};

function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Sub-componente: lista de repos ─────────────────────────────────────────

function RepoList({ repos, deployedSet, loading, error }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');

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

    if (loading) return (
        <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 32 }}>
            Cargando repositorios...
        </p>
    );
    if (error) return (
        <p style={{ color: '#ef4444', fontSize: 14, padding: 16 }}>{error}</p>
    );

    return (
        <div>
            {/* Búsqueda y filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar..."
                    style={{
                        flex: 1, minWidth: 180,
                        padding: '8px 14px', fontSize: 14,
                        border: '1px solid var(--border)', borderRadius: 8,
                        background: 'var(--bg-soft)', color: 'var(--text)', outline: 'none',
                    }}
                />
                {['all', 'available', 'deployed', 'public', 'private'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                        padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                        borderRadius: 8, border: '1px solid var(--border)',
                        background: filter === f ? 'var(--accent)' : 'transparent',
                        color: filter === f ? '#fff' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                    }}>
                        {{ all:'Todos', available:'Disponibles', deployed:'Desplegados', public:'Públicos', private:'Privados' }[f]}
                    </button>
                ))}
            </div>

            {/* Lista */}
            {filtered.length === 0 ? (
                <div style={{
                    padding: 32, textAlign: 'center',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    color: 'var(--text-muted)', fontSize: 14,
                }}>
                    No se encontraron repositorios
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.map(repo => {
                        const isDeployed = deployedSet.has(repo.url);
                        return (
                            <div key={repo.id} style={{
                                display: 'flex', alignItems: 'center', gap: 16,
                                padding: '14px 18px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm, 10px)',
                                background: 'var(--bg-card)', flexWrap: 'wrap',
                            }}>
                                <div style={{ flex: 1, minWidth: 180 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                        <a href={repo.url} target="_blank" rel="noreferrer"
                                            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                                            {repo.fullName}
                                        </a>
                                        {repo.private && (
                                            <span style={{ fontSize: 11, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-faint)' }}>
                                                Privado
                                            </span>
                                        )}
                                        {isDeployed && (
                                            <span style={{ fontSize: 11, padding: '2px 7px', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 4, color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}>
                                                ✓ Desplegado
                                            </span>
                                        )}
                                    </div>
                                    {repo.description && (
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                                            {repo.description}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                        {repo.language && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-faint)' }}>
                                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: LANGUAGE_COLORS[repo.language] || '#888', display: 'inline-block' }} />
                                                {repo.language}
                                            </span>
                                        )}
                                        {repo.stars > 0 && (
                                            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>★ {repo.stars}</span>
                                        )}
                                        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{timeAgo(repo.pushedAt)}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate('/deploy', { state: { repoUrl: repo.url, branch: repo.defaultBranch } })}
                                    style={{
                                        padding: '8px 16px', fontSize: 13, fontWeight: 600,
                                        borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                                        background: isDeployed ? 'transparent' : 'var(--accent)',
                                        color: isDeployed ? 'var(--text-muted)' : '#fff',
                                        border: isDeployed ? '1px solid var(--border)' : 'none',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {isDeployed ? 'Redesplegar' : 'Desplegar →'}
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

function OrgCard({ org, onClick }) {
    const [hover, setHover] = useState(false);
    return (
        <div
            onClick={() => onClick(org)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                padding: 20, cursor: 'pointer',
                border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius, 14px)',
                background: hover ? 'rgba(79,70,229,0.04)' : 'var(--bg-card)',
                transition: 'all 0.2s',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, textAlign: 'center',
            }}
        >
            <img
                src={org.avatarUrl}
                alt={org.login}
                style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border)' }}
                onError={e => { e.target.style.display = 'none'; }}
            />
            <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {org.name || org.login}
                </div>
                {org.description && (
                    <div style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        maxWidth: 160,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                        {org.description}
                    </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
                    {org.publicRepos} repos públicos
                </div>
            </div>
        </div>
    );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function GitHubReposPanel({ deployedRepos = [] }) {
    const [tab, setTab] = useState('repos'); // 'repos' | 'orgs'

    // Estado: mis repos
    const [myRepos, setMyRepos]       = useState([]);
    const [myLoading, setMyLoading]   = useState(true);
    const [myError, setMyError]       = useState('');
    const [hasToken, setHasToken]     = useState(false);

    // Estado: organizaciones
    const [orgs, setOrgs]             = useState([]);
    const [orgsLoading, setOrgsLoading] = useState(false);
    const [orgsLoaded, setOrgsLoaded]   = useState(false);
    const [orgsError, setOrgsError]     = useState('');

    // Estado: repos de la org seleccionada
    const [selectedOrg, setSelectedOrg]     = useState(null);
    const [orgRepos, setOrgRepos]           = useState([]);
    const [orgReposLoading, setOrgReposLoading] = useState(false);
    const [orgReposError, setOrgReposError]     = useState('');

    const deployedSet = useMemo(() => new Set(deployedRepos), [deployedRepos]);

    // Cargar mis repos al montar
    useEffect(() => {
        fetch('/api/github-repos', { headers: getAuthHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data.repos) { setMyRepos(data.repos); setHasToken(data.hasToken); }
                else setMyError(data.error || 'Error cargando repositorios');
            })
            .catch(() => setMyError('Error de red'))
            .finally(() => setMyLoading(false));
    }, []);

    // Cargar orgs cuando el usuario cambia a esa pestaña (lazy)
    function handleTabOrgs() {
        setTab('orgs');
        if (orgsLoaded) return;
        setOrgsLoading(true);
        fetch('/api/github-orgs', { headers: getAuthHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data.orgs) setOrgs(data.orgs);
                else setOrgsError(data.error || 'Error cargando organizaciones');
                setOrgsLoaded(true);
            })
            .catch(() => setOrgsError('Error de red'))
            .finally(() => setOrgsLoading(false));
    }

    // Cargar repos de una org al hacer clic
    function handleOrgClick(org) {
        setSelectedOrg(org);
        setOrgRepos([]);
        setOrgReposError('');
        setOrgReposLoading(true);
        fetch(`/api/github-org-repos?org=${encodeURIComponent(org.login)}`, { headers: getAuthHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data.repos) setOrgRepos(data.repos);
                else setOrgReposError(data.error || 'Error cargando repos');
            })
            .catch(() => setOrgReposError('Error de red'))
            .finally(() => setOrgReposLoading(false));
    }

    return (
        <div style={{ marginBottom: 40 }}>
            {/* Header con pestañas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    GitHub
                </h2>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-soft)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
                    {[
                        { key: 'repos', label: 'Mis Repos' },
                        { key: 'orgs',  label: 'Organizaciones' },
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={t.key === 'orgs' ? handleTabOrgs : () => setTab('repos')}
                            style={{
                                padding: '6px 16px', fontSize: 13, fontWeight: 500,
                                borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: tab === t.key ? 'var(--bg-card)' : 'transparent',
                                color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
                                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                                transition: 'all 0.15s',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {!hasToken && tab === 'repos' && (
                <div style={{
                    padding: '10px 16px', marginBottom: 16,
                    border: '1px solid rgba(79,70,229,0.3)', borderRadius: 8,
                    background: 'rgba(79,70,229,0.06)', fontSize: 13,
                    color: 'var(--text-muted)',
                }}>
                    Conecta tu cuenta de GitHub para ver repos privados y organizaciones.
                </div>
            )}

            {/* Pestaña: Mis Repos */}
            {tab === 'repos' && (
                <RepoList
                    repos={myRepos}
                    deployedSet={deployedSet}
                    loading={myLoading}
                    error={myError}
                />
            )}

            {/* Pestaña: Organizaciones */}
            {tab === 'orgs' && (
                <div>
                    {selectedOrg ? (
                        // Vista de repos de la org seleccionada
                        <div>
                            <button
                                onClick={() => { setSelectedOrg(null); setOrgRepos([]); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    marginBottom: 20, padding: '6px 14px',
                                    border: '1px solid var(--border)', borderRadius: 8,
                                    background: 'transparent', color: 'var(--text-muted)',
                                    fontSize: 13, cursor: 'pointer',
                                }}
                            >
                                ← Volver a organizaciones
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <img
                                    src={selectedOrg.avatarUrl}
                                    alt={selectedOrg.login}
                                    style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)' }}
                                />
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                                        {selectedOrg.name || selectedOrg.login}
                                    </div>
                                    {selectedOrg.description && (
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
                            />
                        </div>
                    ) : (
                        // Grid de tarjetas de organizaciones
                        orgsLoading ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 32 }}>
                                Cargando organizaciones...
                            </p>
                        ) : orgsError ? (
                            <p style={{ color: '#ef4444', fontSize: 14 }}>{orgsError}</p>
                        ) : orgs.length === 0 ? (
                            <div style={{
                                padding: 32, textAlign: 'center',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                                color: 'var(--text-muted)', fontSize: 14,
                            }}>
                                No perteneces a ninguna organización
                                {!hasToken && ' — conecta tu cuenta de GitHub para ver organizaciones privadas'}
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: 12,
                            }}>
                                {orgs.map(org => (
                                    <OrgCard key={org.login} org={org} onClick={handleOrgClick} />
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
```

---

## PASO 3 — No se requieren cambios adicionales en `Dashboard.jsx`

El componente `GitHubReposPanel` ya está siendo importado y renderizado desde el MD anterior. Como se reemplaza el archivo completo del componente, los cambios de pestaña y organizaciones aparecen automáticamente.

Solo verificar que `Dashboard.jsx` sigue teniendo:

```jsx
import GitHubReposPanel from '../components/GitHubReposPanel';
// ...
<GitHubReposPanel deployedRepos={deployedRepoUrls} />
```

---

## Resumen de cambios

| Acción | Archivo |
|--------|---------|
| Agregar endpoint | `deploy_panel/apps/builder/index.js` → `GET /github-orgs` |
| Agregar endpoint | `deploy_panel/apps/builder/index.js` → `GET /github-org-repos?org=nombre` |
| Reemplazar componente | `deploy_panel/apps/web/src/components/GitHubReposPanel.jsx` — versión completa con pestañas Mis Repos y Organizaciones |

---

## Comportamiento esperado

```
Dashboard
  └── GitHub
        ├── [Mis Repos] [Organizaciones]   ← pestañas
        │
        ├── Mis Repos (activo por defecto)
        │     ├── Búsqueda + filtros
        │     └── Lista de repos con badges y botón Desplegar
        │
        └── Organizaciones
              ├── Grid de tarjetas (avatar, nombre, descripción, nº repos)
              └── Al hacer clic en una tarjeta:
                    ├── "← Volver a organizaciones"
                    ├── Header: avatar + nombre + descripción de la org
                    └── Lista de repos (misma UI que Mis Repos)
```

## Notas

- Las organizaciones se cargan **lazy** — solo cuando el usuario hace clic en la pestaña "Organizaciones" por primera vez, no al montar el Dashboard
- Dentro de cada org, los repos también muestran los badges "Desplegado" / "Disponible" comparando contra los repos activos del usuario en StarDest
- El botón "Desplegar →" dentro de repos de una organización funciona igual — navega a `/deploy` con el repo prellenado
- Si el usuario no tiene token de GitHub guardado, `GET /github-orgs` usa la API pública y solo devuelve organizaciones públicas con una nota informativa
