# Instrucciones: Implementación completa de repositorios privados

## Contexto

El backend ya tiene los endpoints `/github-token` implementados y el clone ya inyecta el token automáticamente. Lo que falta es:

1. Mostrar la sección "Conectar GitHub" en el Dashboard
2. Que "Cargar Ramas" en Deploy.jsx use el token guardado del usuario al consultar la API de GitHub

---

## TAREA 1 — Agregar `GitHubTokenSection` al Dashboard

### 1a. Crear el componente

Agregar este componente dentro de `Dashboard.jsx` (puede ir al final del archivo, antes del `export default`):

```jsx
function GitHubTokenSection() {
    const [status, setStatus]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken]     = useState('');
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const authToken = localStorage.getItem('auth_token');
        fetch('/api/github-token/status', {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        })
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
            const authToken = localStorage.getItem('auth_token');
            const res = await fetch('/api/github-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
                },
                body: JSON.stringify({ githubToken: token.trim() })
            });
            const data = await res.json();
            if (data.ok) {
                setStatus('connected');
                setToken('');
                setSuccess(data.githubUsername
                    ? `Conectado como @${data.githubUsername}`
                    : 'Token guardado correctamente');
            } else {
                setError(data.error || 'Error guardando el token');
            }
        } catch (e) {
            setError('Error de red');
        } finally {
            setSaving(false));
        }
    }

    async function handleDisconnect() {
        const authToken = localStorage.getItem('auth_token');
        await fetch('/api/github-token', {
            method: 'DELETE',
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        });
        setStatus('disconnected');
        setSuccess('');
    }

    if (loading) return null;

    return (
        <div style={{
            padding: 24,
            borderRadius: 'var(--radius, 14px)',
            border: '1px solid var(--border, #26282f)',
            background: 'var(--bg-card, #16181d)',
            marginBottom: 32,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #f3f4f6)', margin: 0 }}>
                        Repositorios privados de GitHub
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)', margin: '4px 0 0' }}>
                        Conecta tu cuenta para desplegar repos privados automáticamente.
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13,
                    color: status === 'connected' ? '#22c55e' : 'var(--text-faint, #6b7280)',
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: status === 'connected' ? '#22c55e' : 'var(--border, #26282f)',
                        display: 'inline-block',
                    }} />
                    {status === 'connected' ? 'Conectado' : 'No conectado'}
                </div>
            </div>

            {status === 'connected' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-muted, #9ca3af)' }}>
                        Token guardado. Tus deploys usarán este token automáticamente.
                    </span>
                    <button
                        onClick={handleDisconnect}
                        style={{
                            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                            border: '1px solid var(--border, #26282f)',
                            borderRadius: 8,
                            background: 'transparent',
                            color: 'var(--text-muted, #9ca3af)',
                        }}
                    >
                        Desconectar
                    </button>
                    {success && (
                        <span style={{ fontSize: 13, color: '#22c55e' }}>{success}</span>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                            type="password"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            style={{
                                flex: 1, minWidth: 200,
                                padding: '10px 14px', fontSize: 14,
                                border: '1px solid var(--border, #26282f)',
                                borderRadius: 8,
                                background: 'var(--bg-soft, #13151a)',
                                color: 'var(--text, #f3f4f6)',
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={handleSave}
                            disabled={saving || !token.trim()}
                            style={{
                                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                                background: 'var(--accent, #4f46e5)',
                                color: '#fff',
                                border: 'none', borderRadius: 8,
                                cursor: saving || !token.trim() ? 'not-allowed' : 'pointer',
                                opacity: saving || !token.trim() ? 0.6 : 1,
                                transition: 'opacity 0.15s',
                            }}
                        >
                            {saving ? 'Guardando...' : 'Guardar token'}
                        </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-faint, #6b7280)', margin: 0 }}>
                        Genera tu token en{' '}
                        <a
                            href="https://github.com/settings/tokens/new?scopes=repo&description=StarDest"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--accent, #818cf8)' }}
                        >
                            github.com/settings/tokens
                        </a>
                        {' '}con el permiso <strong>repo</strong> activado.
                    </p>
                    {error && (
                        <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
                    )}
                </div>
            )}
        </div>
    );
}
```

### 1b. Renderizar en el Dashboard

Dentro del componente principal de `Dashboard.jsx`, agregar `<GitHubTokenSection />` justo **antes** de la lista de deploys (antes de donde se renderizan las cards):

```jsx
<GitHubTokenSection />
{/* lista de deploys aquí */}
```

---

## TAREA 2 — Que "Cargar Ramas" use el token del usuario

El botón "Cargar Ramas" en `Deploy.jsx` hace una llamada a la API de GitHub para obtener las ramas del repo. Si el repo es privado, esta llamada falla sin autenticación.

### 2a. Crear función helper para obtener el token

En `Deploy.jsx`, agregar esta función antes del componente principal:

```javascript
async function fetchGithubBranches(repoUrl) {
    // Extraer owner/repo de la URL
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) throw new Error('URL de repositorio inválida');
    const repoPath = match[1];

    const authToken = localStorage.getItem('auth_token');

    // Intentar primero con el token del usuario (para repos privados)
    if (authToken) {
        const statusRes = await fetch('/api/github-token/status', {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        const statusData = await statusRes.json();

        if (statusData.connected) {
            // Pedir al backend que obtenga las ramas usando el token guardado
            const res = await fetch(`/api/github-branches?repo=${encodeURIComponent(repoPath)}`, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                return data.branches;
            }
        }
    }

    // Fallback: API pública de GitHub (solo repos públicos)
    const res = await fetch(`https://api.github.com/repos/${repoPath}/branches`);
    if (!res.ok) {
        if (res.status === 404) throw new Error('Repositorio no encontrado o privado');
        throw new Error(`Error al obtener ramas: ${res.status}`);
    }
    const branches = await res.json();
    return branches.map(b => b.name);
}
```

### 2b. Reemplazar la llamada existente en el handler de "Cargar Ramas"

Buscar donde está el handler que llama a la API de GitHub para cargar ramas (probablemente algo como `handleLoadBranches` o similar) y reemplazar la lógica de fetch por:

```javascript
async function handleLoadBranches() {
    if (!repoUrl.trim()) return;
    setLoadingBranches(true);
    setBranchError('');
    try {
        const branches = await fetchGithubBranches(repoUrl.trim());
        setBranches(branches);
    } catch (err) {
        setBranchError(err.message);
    } finally {
        setLoadingBranches(false);
    }
}
```

---

## TAREA 3 — Endpoint backend para obtener ramas con token

El frontend no puede usar el token de GitHub directamente (nunca lo recibe), así que el backend expone un endpoint proxy que usa el token guardado internamente.

En `deploy_panel/apps/builder/index.js`, agregar este endpoint:

```javascript
// GET /github-branches?repo=owner/repo
// Obtiene las ramas de un repositorio usando el token guardado del usuario
app.get('/github-branches', async (req, res) => {
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

    const { repo } = req.query;
    if (!repo || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
        return res.status(400).json({ error: 'Repo inválido' });
    }

    const githubToken = getUserToken(userId);
    if (!githubToken) {
        return res.status(403).json({ error: 'No hay token de GitHub guardado' });
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/branches`, {
            headers: {
                Authorization: `token ${githubToken}`,
                Accept: 'application/vnd.github.v3+json',
            }
        });

        if (!response.ok) {
            const status = response.status;
            if (status === 404) return res.status(404).json({ error: 'Repositorio no encontrado o sin acceso' });
            return res.status(status).json({ error: `GitHub API error: ${status}` });
        }

        const data = await response.json();
        res.json({ branches: data.map(b => b.name) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

**Nota:** este endpoint requiere que `fetch` esté disponible globalmente. En Node.js 18+ está disponible de forma nativa. Si la versión de Node es menor a 18, agregar al inicio del archivo:

```javascript
const fetch = globalThis.fetch || require('node-fetch');
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/web/src/pages/Dashboard.jsx` | Agregar componente `GitHubTokenSection` y renderizarlo antes de la lista de deploys |
| `deploy_panel/apps/web/src/pages/Deploy.jsx` | Agregar función `fetchGithubBranches` y actualizar el handler de "Cargar Ramas" para usarla |
| `deploy_panel/apps/builder/index.js` | Agregar endpoint `GET /github-branches` que usa el token guardado para consultar la API de GitHub |

## Flujo completo después de implementar

```
Usuario va a Dashboard
    ↓
Ve sección "Repositorios privados de GitHub" → No conectado
    ↓
Genera PAT en GitHub (link directo con scope repo preseleccionado)
    ↓
Pega el token → "Guardar token"
    ↓
Backend verifica con api.github.com/user → guarda cifrado
    ↓
Sección muestra "Conectado como @usuario"

Usuario va a Deploy → pega URL de repo privado → "Cargar Ramas"
    ↓
Deploy.jsx detecta que hay token guardado
    ↓
Llama a /api/github-branches (backend proxy)
    ↓
Backend usa token cifrado → consulta GitHub API → devuelve ramas
    ↓
Dropdown muestra las ramas del repo privado ✅

Usuario hace deploy
    ↓
deployApp inyecta token en la URL de clone
    ↓
git clone https://token@github.com/user/private-repo
    ↓
Deploy exitoso ✅
```
