# Instrucciones: Soporte para repositorios privados con token de GitHub por usuario

## Contexto

Actualmente `deployApp` clona repos públicos. Para repos privados, el clone falla con un error de autenticación. La solución es permitir que cada usuario conecte su cuenta de GitHub una vez desde el Dashboard, guardar su Personal Access Token (PAT) en el servidor de forma segura, y usarlo automáticamente en todos sus deploys futuros.

**Flujo para el usuario:**
1. Va a **Dashboard → Configuración** (nueva sección)
2. Genera un PAT en GitHub con permisos `repo` y lo pega
3. StarDest lo guarda asociado a su `userId`
4. A partir de ese momento, todos sus deploys de repos privados funcionan automáticamente

---

## PASO 1 — Backend: almacenar tokens de GitHub

Los tokens se guardan en un archivo JSON en el servidor, cifrados con el `SESSION_SECRET`. **Nunca** se devuelven al frontend en texto plano — solo se usan internamente para el clone.

### Agregar dependencia de cifrado

No se necesita ninguna dependencia nueva — Node.js tiene `crypto` nativo con AES-256-GCM.

### Agregar funciones de cifrado/descifrado en `index.js`

```javascript
const TOKENS_FILE = path.join(process.env.DEPLOYS_DIR || '/home/project/deploys', 'user_tokens.json');
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-secret').digest(); // 32 bytes

function encryptToken(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(ciphertext) {
    const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function saveUserToken(userId, token) {
    let tokens = {};
    if (fs.existsSync(TOKENS_FILE)) {
        try { tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch (e) {}
    }
    tokens[userId] = encryptToken(token);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function getUserToken(userId) {
    if (!userId || !fs.existsSync(TOKENS_FILE)) return null;
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        if (!tokens[userId]) return null;
        return decryptToken(tokens[userId]);
    } catch (e) {
        console.warn('[Token] Error descifrando token:', e.message);
        return null;
    }
}

function deleteUserToken(userId) {
    if (!fs.existsSync(TOKENS_FILE)) return;
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        delete tokens[userId];
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch (e) {}
}
```

---

## PASO 2 — Backend: endpoints para gestionar el token

```javascript
// POST /github-token — guardar o actualizar el token del usuario
app.post('/github-token', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ ok: false, error: 'No autenticado' });

    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ ok: false, error: 'Token inválido' });
    }

    const { githubToken } = req.body;
    if (!githubToken || typeof githubToken !== 'string' || githubToken.trim().length < 10) {
        return res.status(400).json({ ok: false, error: 'Token de GitHub inválido' });
    }

    // Verificar que el token sea válido consultando la API de GitHub
    try {
        const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
        const ghRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${githubToken.trim()}` }
        });
        if (!ghRes.ok) {
            return res.status(400).json({ ok: false, error: 'El token de GitHub no es válido o no tiene los permisos necesarios' });
        }
        const ghUser = await ghRes.json();
        saveUserToken(userId, githubToken.trim());
        console.log(`[Token] Token de GitHub guardado para userId ${userId} (GitHub: ${ghUser.login})`);
        res.json({ ok: true, githubUsername: ghUser.login });
    } catch (e) {
        // Si no se puede verificar (sin conexión), guardar de todas formas
        saveUserToken(userId, githubToken.trim());
        res.json({ ok: true, githubUsername: null });
    }
});

// GET /github-token/status — verificar si el usuario tiene token guardado
app.get('/github-token/status', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ connected: false });

    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ connected: false });
    }

    const token = getUserToken(userId);
    res.json({ connected: !!token });
});

// DELETE /github-token — eliminar el token del usuario
app.delete('/github-token', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ ok: false });

    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ ok: false });
    }

    deleteUserToken(userId);
    res.json({ ok: true });
});
```

---

## PASO 3 — Backend: usar el token en el clone

En `deployApp`, modificar el clone para inyectar el token si existe:

```javascript
// ANTES:
await git.clone(repoUrl, repoPath, cloneOptions);

// DESPUÉS:
let cloneUrl = repoUrl;
const userGithubToken = getUserToken(userId);
if (userGithubToken) {
    // Inyectar token en la URL: https://token@github.com/user/repo
    try {
        const urlObj = new URL(repoUrl);
        if (urlObj.hostname === 'github.com') {
            urlObj.username = userGithubToken;
            cloneUrl = urlObj.toString();
            console.log(`[Clone] Usando token de GitHub para clone privado`);
        }
    } catch (e) {}
}

await git.clone(cloneUrl, repoPath, cloneOptions);
```

**Nota de seguridad:** la URL con el token nunca se loguea — el `console.log` solo dice "Usando token" sin mostrar la URL completa.

---

## PASO 4 — Frontend: sección "Conectar GitHub" en el Dashboard

### En `Dashboard.jsx`, agregar una nueva sección de configuración:

```jsx
function GitHubTokenSection() {
    const [status, setStatus]     = useState(null); // null | 'connected' | 'disconnected'
    const [loading, setLoading]   = useState(true);
    const [token, setToken]       = useState('');
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');
    const [success, setSuccess]   = useState('');

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
            setSaving(false);
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
            padding: 24, borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            marginBottom: 32,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                        Repositorios privados de GitHub
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Conecta tu cuenta para desplegar repos privados automáticamente.
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13, color: status === 'connected' ? '#22c55e' : 'var(--text-faint)',
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: status === 'connected' ? '#22c55e' : 'var(--border)',
                    }} />
                    {status === 'connected' ? 'Conectado' : 'No conectado'}
                </div>
            </div>

            {status === 'connected' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                        Token guardado correctamente. Tus deploys usarán este token automáticamente.
                    </span>
                    <button
                        onClick={handleDisconnect}
                        style={{
                            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                            border: '1px solid var(--border)', borderRadius: 8,
                            background: 'transparent', color: 'var(--text-muted)',
                        }}
                    >
                        Desconectar
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="password"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            style={{
                                flex: 1, padding: '10px 14px', fontSize: 14,
                                border: '1px solid var(--border)', borderRadius: 8,
                                background: 'var(--bg-soft)', color: 'var(--text)',
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={handleSave}
                            disabled={saving || !token.trim()}
                            style={{
                                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                                background: 'var(--accent)', color: '#fff',
                                border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
                                opacity: saving || !token.trim() ? 0.6 : 1,
                            }}
                        >
                            {saving ? 'Guardando...' : 'Guardar token'}
                        </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                        Genera tu token en{' '}
                        <a
                            href="https://github.com/settings/tokens/new?scopes=repo&description=StarDest"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--accent)' }}
                        >
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
```

Agregar `<GitHubTokenSection />` al inicio del Dashboard, antes de la lista de deploys.

---

## PASO 5 — Volumen para persistir los tokens entre reinicios

En `~/deploys/docker-compose.yml`, agregar el archivo de tokens como volumen en `deploy_panel`:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - ./static_sites:/home/project/deploys/static_sites
  - ./nginx_configs:/home/project/deploys/nginx_configs
  - ./sessions:/tmp/sessions
  - ./user_tokens.json:/home/project/deploys/user_tokens.json  # 👈 nuevo
```

Y crear el archivo vacío en el servidor antes del próximo rebuild:

```bash
echo '{}' > ~/deploys/user_tokens.json
chmod 600 ~/deploys/user_tokens.json
```

---

## Resumen de cambios

| Acción | Archivo |
|--------|---------|
| Modificar | `deploy_panel/apps/builder/index.js` — funciones de cifrado/descifrado |
| Modificar | `deploy_panel/apps/builder/index.js` — funciones `saveUserToken`, `getUserToken`, `deleteUserToken` |
| Modificar | `deploy_panel/apps/builder/index.js` — endpoints `POST/GET/DELETE /github-token` |
| Modificar | `deploy_panel/apps/builder/index.js` — `deployApp` inyecta token en el clone URL |
| Modificar | `deploy_panel/apps/web/src/pages/Dashboard.jsx` — agregar componente `GitHubTokenSection` |
| Modificar | `~/deploys/docker-compose.yml` (servidor) — montar `user_tokens.json` como volumen |
| Ejecutar en servidor | `echo '{}' > ~/deploys/user_tokens.json && chmod 600 ~/deploys/user_tokens.json` |

## Cómo generar el token en GitHub

El botón "Genera tu token" en el Dashboard abre directamente:
```
https://github.com/settings/tokens/new?scopes=repo&description=StarDest
```

El usuario solo necesita activar el scope `repo` (acceso a repos privados) y copiar el token generado. Los tokens clásicos (`ghp_...`) y los fine-grained tokens (`github_pat_...`) ambos funcionan.

## Seguridad

- Los tokens se cifran con AES-256-GCM usando el `SESSION_SECRET` del servidor como clave — nadie puede leerlos aunque accedan al archivo `user_tokens.json`
- El token nunca se devuelve al frontend ni aparece en los logs
- El archivo `user_tokens.json` tiene permisos `600` (solo lectura/escritura para el dueño)
- Si el usuario desconecta su cuenta, el token se borra permanentemente del servidor
