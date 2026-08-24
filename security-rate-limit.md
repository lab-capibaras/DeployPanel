# Instrucciones: Seguridad — Rate limiting y tokens de GitHub expirados

---

## PARTE 1 — Rate limiting en `/deploy`

### Contexto

Actualmente cualquier usuario autenticado puede lanzar deploys ilimitados en paralelo, lo que puede saturar el servidor. El rate limit debe ser por usuario (no por IP, porque los usuarios legítimos pueden estar detrás de NAT).

Límites razonables:
- Máximo **3 deploys simultáneos** por usuario
- Máximo **10 deploys por hora** por usuario

### Implementación en `index.js`

#### 1a. Mapa de control en memoria

```javascript
// Rate limiting por usuario
const deployInProgress = new Map();   // userId → número de deploys activos
const deployHistory    = new Map();   // userId → array de timestamps

const MAX_CONCURRENT = 3;    // deploys simultáneos por usuario
const MAX_PER_HOUR   = 10;   // deploys por hora por usuario
const ONE_HOUR       = 60 * 60 * 1000;

function canDeploy(userId) {
    // Verificar deploys simultáneos
    const concurrent = deployInProgress.get(userId) || 0;
    if (concurrent >= MAX_CONCURRENT) {
        return {
            allowed: false,
            reason: `Tienes ${concurrent} deploys en progreso. Espera a que terminen antes de iniciar otro.`,
            code: 'CONCURRENT_LIMIT',
        };
    }

    // Verificar límite por hora
    const now = Date.now();
    const history = (deployHistory.get(userId) || []).filter(t => now - t < ONE_HOUR);
    deployHistory.set(userId, history);

    if (history.length >= MAX_PER_HOUR) {
        const oldest = history[0];
        const resetIn = Math.ceil((oldest + ONE_HOUR - now) / 60000);
        return {
            allowed: false,
            reason: `Límite de ${MAX_PER_HOUR} deploys por hora alcanzado. Podrás desplegar en ${resetIn} minuto${resetIn > 1 ? 's' : ''}.`,
            code: 'HOURLY_LIMIT',
        };
    }

    return { allowed: true };
}

function startDeploy(userId) {
    deployInProgress.set(userId, (deployInProgress.get(userId) || 0) + 1);
    const history = deployHistory.get(userId) || [];
    history.push(Date.now());
    deployHistory.set(userId, history);
}

function endDeploy(userId) {
    const current = deployInProgress.get(userId) || 1;
    if (current <= 1) deployInProgress.delete(userId);
    else deployInProgress.set(userId, current - 1);
}
```

#### 1b. Aplicar en `POST /deploy`

```javascript
app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain, branch, env = [] } = req.body;
    if (!repoUrl || !subdomain) return res.status(400).send("Faltan datos");

    // Extraer userId del token
    let userId = 'anonymous';
    let userEmail = 'anonymous';
    const authHeader = req.headers.authorization;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
            userId = decoded.id || 'anonymous';
            userEmail = decoded.email || 'anonymous';
        } catch (e) {}
    }

    // ── Rate limiting ──
    const check = canDeploy(userId);
    if (!check.allowed) {
        return res.status(429).json({
            status: 'error',
            code: check.code,
            details: check.reason,
        });
    }

    const actualBranch = branch || 'main';

    startDeploy(userId);
    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch, userId, userEmail, env);
        saveDeployment(repoUrl, actualBranch, subdomain);
        res.json({ status: 'success', url, message: 'Aplicación desplegada exitosamente', branch: actualBranch, deployedAt: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    } finally {
        endDeploy(userId);
    }
});
```

#### 1c. Endpoint para consultar el estado del rate limit (opcional pero útil)

```javascript
// GET /deploy-quota — estado del rate limit del usuario actual
app.get('/deploy-quota', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.json({ concurrent: 0, hourly: 0, maxConcurrent: MAX_CONCURRENT, maxHourly: MAX_PER_HOUR });

    let userId = 'anonymous';
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        userId = decoded.id || 'anonymous';
    } catch (e) {}

    const now = Date.now();
    const history = (deployHistory.get(userId) || []).filter(t => now - t < ONE_HOUR);
    const concurrent = deployInProgress.get(userId) || 0;

    res.json({
        concurrent,
        hourly: history.length,
        maxConcurrent: MAX_CONCURRENT,
        maxHourly: MAX_PER_HOUR,
    });
});
```

#### 1d. Mostrar el error en `Deploy.jsx`

En el handler del fetch de deploy, manejar el status 429:

```javascript
const data = await res.json();

if (res.status === 429) {
    // Mostrar mensaje de rate limit claro
    setPhase('error');
    setErrorMessage(data.details);  // mensaje amigable ya viene del backend
    return;
}

if (data.status !== 'success') {
    setPhase('error');
    setErrorMessage(data.details || 'Error desconocido');
    return;
}
```

---

## PARTE 2 — Tokens de GitHub expirados o inválidos

### Contexto

Cuando un token de GitHub guardado expira o es revocado por el usuario, el clone falla con un error críptico de git. El sistema debe detectar ese fallo específico, limpiar el token inválido automáticamente y mostrar un mensaje claro al usuario.

### Implementación en `index.js`

#### 2a. Detectar fallo de autenticación en el clone

En `deployApp`, envolver el `git.clone()` para detectar errores de autenticación:

```javascript
try {
    await git.clone(cloneUrl, repoPath, cloneOptions);
} catch (cloneError) {
    const msg = cloneError.message || '';
    const isAuthError =
        msg.includes('Authentication failed') ||
        msg.includes('could not read Username') ||
        msg.includes('Repository not found') ||
        msg.includes('invalid credentials') ||
        msg.includes('403') ||
        msg.includes('401');

    if (isAuthError && userId && getUserToken(userId)) {
        // Token inválido — borrarlo automáticamente
        console.warn(`[Clone] Token de GitHub inválido o expirado para userId ${userId}. Eliminando...`);
        deleteUserToken(userId);

        // Lanzar error descriptivo para el usuario
        throw new Error(
            'TOKEN_GITHUB_INVALIDO: Tu token de GitHub expiró o fue revocado. ' +
            'Ve al Dashboard → "Repositorios privados" y vuelve a conectar tu cuenta.'
        );
    }

    // Otro error de clone (repo no existe, error de red, etc.)
    throw cloneError;
}
```

#### 2b. Mostrar el error claramente en el frontend

En `Deploy.jsx`, en el bloque que maneja el error del deploy, detectar el prefijo `TOKEN_GITHUB_INVALIDO`:

```javascript
if (data.details?.startsWith('TOKEN_GITHUB_INVALIDO:')) {
    setPhase('error');
    setErrorMessage(data.details.replace('TOKEN_GITHUB_INVALIDO: ', ''));
    setTokenExpired(true);   // nuevo estado para mostrar botón de reconectar
    return;
}
```

Agregar el estado:
```jsx
const [tokenExpired, setTokenExpired] = useState(false);
```

En la vista de error, si `tokenExpired` es true, mostrar un botón de acción directa:

```jsx
{phase === 'error' && (
    <div>
        <p style={{ color: '#f87171' }}>{errorMessage}</p>
        {tokenExpired && (
            <a
                href="/dashboard"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    marginTop: 16, padding: '10px 20px',
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 8, textDecoration: 'none',
                    fontSize: 14, fontWeight: 600,
                }}
            >
                Ir al Dashboard para reconectar GitHub →
            </a>
        )}
    </div>
)}
```

#### 2c. Verificar el token al guardarlo (ya implementado en `private-repos.md`)

Si el endpoint `POST /github-token` ya verifica el token contra `api.github.com/user` antes de guardarlo, esto cubre el caso de tokens inválidos desde el inicio. La detección en el clone cubre el caso de tokens que expiran después de ser guardados.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar `canDeploy`, `startDeploy`, `endDeploy`, `deployInProgress`, `deployHistory` |
| `deploy_panel/apps/builder/index.js` | `POST /deploy` aplica rate limiting antes de llamar a `deployApp` |
| `deploy_panel/apps/builder/index.js` | `GET /deploy-quota` expone estado del rate limit del usuario |
| `deploy_panel/apps/builder/index.js` | `deployApp` detecta errores de auth en el clone, borra el token inválido y lanza error descriptivo |
| `deploy_panel/apps/web/src/pages/Deploy.jsx` | Manejar status 429 con mensaje amigable |
| `deploy_panel/apps/web/src/pages/Deploy.jsx` | Detectar `TOKEN_GITHUB_INVALIDO` y mostrar botón de reconectar |

## Notas

- El rate limit es **en memoria** — se resetea si el servidor se reinicia. Para persistirlo habría que guardarlo en Redis o en un archivo, pero para este caso es suficiente ya que los reinicios son poco frecuentes.
- `endDeploy` se llama en el `finally` del try/catch — garantiza que el contador baja aunque el deploy falle, evitando que un deploy fallido bloquee al usuario permanentemente.
- Los límites (`MAX_CONCURRENT = 3`, `MAX_PER_HOUR = 10`) son conservadores para un servidor con 15GB RAM. Se pueden ajustar según el uso real.
