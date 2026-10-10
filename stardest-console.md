# Instrucciones: StarDest Console (panel de administración)

## Qué es

Una nueva herramienta **Console** dentro del menú **Herramientas**, visible y accesible **solo para el administrador**: la cuenta de GitHub `AngelCoronaaa`. Para entrar pide un código de **Google Authenticator** (TOTP) y tiene cuatro secciones:

| Sección | Qué muestra / permite |
|---|---|
| **Monitoreo** | CPU, RAM, swap, disco y uptime del servidor; contenedores de Docker; deploys, usuarios y bases de datos de toda la plataforma; top de contenedores por consumo |
| **Deploys** | Todos los deploys de todos los usuarios, con dueño, estado y contenedores; ver logs, reiniciar, detener/iniciar y eliminar; bases de datos huérfanas |
| **Actividad** | Últimos deploys (inicio, éxito, error con el mensaje) y bitácora de acciones del admin |
| **Mantenimiento** | Salud de servicios (Docker, Traefik, webhook, static_server, cloudflared, frontend); pausar deploys nuevos; limpiar imágenes huérfanas; logs del sistema (`deploy_panel`, `traefik`...) sin entrar por SSH |

## Modelo de seguridad

- **El admin se identifica por su ID de GitHub (`228611465`), no por el username.** En GitHub el username se puede cambiar y otra persona podría registrar `AngelCoronaaa` después; el ID numérico nunca cambia. Además se exige `provider === 'github'`, así que el mismo usuario entrando con Google **no** tiene acceso.
- **Ocultar el menú es solo cosmético.** Toda la protección está en el backend: cada endpoint `/admin/*` exige el JWT del admin **y** una sesión de consola obtenida con TOTP.
- **Sesión de consola:** tras validar el código se emite un token de 30 minutos, firmado con un secreto distinto (`ADMIN_SESSION_SECRET`). Se guarda en `sessionStorage`, así que muere al cerrar la pestaña.
- **Anti fuerza bruta:** 5 códigos incorrectos bloquean el TOTP 15 minutos, y un código ya usado no se acepta de nuevo.
- **Para no-admins, `/admin/*` responde 404**, para no revelar que existe.
- **Las acciones (reiniciar, detener, eliminar) solo aplican a contenedores de usuarios** (`container-*`, `db-*`, `adminer-*`). Nunca se puede detener `traefik`, `deploy_panel`, etc. desde la Console; esos solo se pueden *leer* (logs).
- **El secreto TOTP vive en una variable de entorno del servidor**, nunca en el repo ni en el frontend.

---

## PASO 1 — Dependencias

En la raíz de `deploy_panel` (donde está el `package.json` del backend):

```bash
npm install otplib@12 qrcode
```

Se fija `otplib@12` porque las versiones posteriores cambian la API que usa este MD.

---

## PASO 2 — Backend: `deploy_panel/apps/builder/index.js`

### 2a. `/auth/me` devuelve si el usuario es admin

Reemplazar el endpoint actual:

```javascript
// Sesión actual
app.get('/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.json({ authenticated: false, user: null });
    try {
        const user = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
        res.json({ authenticated: true, user: { ...user, isAdmin: isAdminUser(user) } });
    } catch {
        res.json({ authenticated: false, user: null });
    }
});
```

(`isAdminUser` se define en el paso 2b; como las funciones se declaran con `function`, no importa el orden.)

### 2b. Sección completa de la Console

Agregar **al final del archivo, justo antes de `app.listen(...)`**:

```javascript
// ==========================================
// --- STARDEST CONSOLE (solo admin) ---
// ==========================================
const { authenticator } = require('otplib');
authenticator.options = { window: 1 }; // tolera ±30 s de desfase de reloj

const ADMIN_GITHUB_IDS = (process.env.ADMIN_GITHUB_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || '';
const ADMIN_SESSION_TTL = 30 * 60; // segundos

// Contenedores sobre los que la Console puede ACTUAR (solo los de usuarios)
const MANAGED_CONTAINER = /^(container|db|adminer)-[a-z0-9][a-z0-9-]*$/;
// Contenedores del sistema cuyos logs se pueden LEER (nunca detener/eliminar)
const SYSTEM_LOG_CONTAINERS = ['deploy_panel', 'traefik', 'static_server', 'cloudflared', 'stardest_web'];

// ── Estado en memoria (se reinicia si el panel se reinicia) ──
let deploysPaused = false;
const deployEvents = [];      // últimos 200 eventos de deploy
const adminAudit = [];        // últimas 200 acciones del admin
const totpState = new Map();  // userId → { fails, lockedUntil, lastCode, lastCodeAt }

function pushCapped(list, item, max = 200) {
    list.unshift(item);
    if (list.length > max) list.length = max;
}

function recordDeployEvent(type, data) {
    pushCapped(deployEvents, { ts: Date.now(), type, ...data });
}

function audit(req, action, target = '') {
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    pushCapped(adminAudit, { ts: Date.now(), action, target, ip });
    console.log(`[Admin] ${action} ${target} (${ip})`);
}

function getRequestUser(req) {
    const header = req.headers.authorization;
    if (!header) return null;
    try {
        return jwt.verify(header.split(' ')[1], process.env.SESSION_SECRET || 'dev-secret');
    } catch {
        return null;
    }
}

function isAdminUser(user) {
    return !!user
        && user.provider === 'github'
        && ADMIN_GITHUB_IDS.includes(String(user.id));
}

// ── Middlewares ──
function requireAdmin(req, res, next) {
    const user = getRequestUser(req);
    if (!isAdminUser(user)) return res.status(404).json({ error: 'Not found' });
    req.adminUser = user;
    next();
}

function requireAdminSession(req, res, next) {
    if (!ADMIN_SESSION_SECRET) return res.status(503).json({ error: 'Console no configurada' });
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ error: 'Código TOTP requerido', code: 'TOTP_REQUIRED' });
    try {
        const payload = jwt.verify(token, ADMIN_SESSION_SECRET);
        if (payload.scope !== 'admin' || String(payload.sub) !== String(req.adminUser.id)) throw new Error('scope');
        next();
    } catch {
        return res.status(401).json({ error: 'Sesión de consola expirada', code: 'TOTP_REQUIRED' });
    }
}

const adminOnly = [requireAdmin, requireAdminSession];

// ── Helpers de monitoreo ──
function readMeminfo() {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => Number((txt.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1] || 0) * 1024;
    return {
        total: get('MemTotal'), available: get('MemAvailable'),
        swapTotal: get('SwapTotal'), swapFree: get('SwapFree'),
    };
}

async function sampleCpuPercent(ms = 400) {
    const a = os.cpus();
    await new Promise(r => setTimeout(r, ms));
    const b = os.cpus();
    let idle = 0, total = 0;
    b.forEach((cpu, i) => {
        const d = (k) => cpu.times[k] - a[i].times[k];
        const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
        total += t;
        idle += d('idle');
    });
    return total ? Math.round((1 - idle / total) * 1000) / 10 : 0;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// Los logs de Docker sin TTY vienen multiplexados (cabecera de 8 bytes por bloque)
function demuxDockerLogs(buf) {
    if (!Buffer.isBuffer(buf)) return String(buf || '');
    const multiplexed = buf.length >= 8 && [0, 1, 2].includes(buf[0]) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
    if (!multiplexed) return buf.toString('utf8');
    let out = '';
    let i = 0;
    while (i + 8 <= buf.length) {
        const size = buf.readUInt32BE(i + 4);
        out += buf.slice(i + 8, i + 8 + size).toString('utf8');
        i += 8 + size;
    }
    return out;
}

async function checkHttp(url, isOk = (r) => r.ok) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
        return isOk(r) ? 'ok' : 'down';
    } catch (e) {
        const code = String(e.cause?.code || e.message);
        return /ENOTFOUND|EAI_AGAIN/.test(code) ? 'unknown' : 'down';
    }
}

async function containerState(name) {
    try {
        const info = await docker.getContainer(name).inspect();
        return info.State.Running ? 'ok' : 'down';
    } catch {
        return 'missing';
    }
}

// ── TOTP ──
app.post('/admin/totp/verify', requireAdmin, (req, res) => {
    if (!ADMIN_TOTP_SECRET || !ADMIN_SESSION_SECRET) {
        return res.status(503).json({ error: 'La consola no está configurada en el servidor' });
    }
    const id = String(req.adminUser.id);
    const now = Date.now();
    const state = totpState.get(id) || { fails: 0, lockedUntil: 0, lastCode: null, lastCodeAt: 0 };

    if (state.lockedUntil > now) {
        const min = Math.ceil((state.lockedUntil - now) / 60000);
        return res.status(429).json({ error: `Demasiados intentos. Espera ${min} min.` });
    }

    const code = String(req.body?.code || '').replace(/\s/g, '');
    if (code && code === state.lastCode && now - state.lastCodeAt < 90000) {
        return res.status(401).json({ error: 'Ese código ya se usó. Espera el siguiente.' });
    }

    let valid = false;
    try {
        valid = /^\d{6}$/.test(code) && authenticator.verify({ token: code, secret: ADMIN_TOTP_SECRET });
    } catch {
        valid = false;
    }

    if (!valid) {
        state.fails += 1;
        if (state.fails >= 5) {
            state.fails = 0;
            state.lockedUntil = now + 15 * 60 * 1000;
        }
        totpState.set(id, state);
        audit(req, 'totp_fail');
        return res.status(401).json({ error: 'Código incorrecto' });
    }

    totpState.set(id, { fails: 0, lockedUntil: 0, lastCode: code, lastCodeAt: now });
    audit(req, 'totp_ok');
    const adminToken = jwt.sign({ sub: id, scope: 'admin' }, ADMIN_SESSION_SECRET, { expiresIn: ADMIN_SESSION_TTL });
    res.json({ adminToken, expiresIn: ADMIN_SESSION_TTL });
});

// ── Monitoreo: servidor + plataforma ──
app.get('/admin/overview', ...adminOnly, async (req, res) => {
    try {
        const [cpu, info, containers, disk] = await Promise.all([
            sampleCpuPercent(),
            docker.info(),
            docker.listContainers({ all: true }),
            fs.promises.statfs(STATIC_SITES_DIR).catch(() => null),
        ]);

        const appContainers = containers.filter(c => c.Names.some(n => n.startsWith('/container-')));
        const subdomains = new Set(appContainers.map(c =>
            c.Labels['deploy.subdomain'] || c.Names[0].replace('/container-', '').replace(/-(backend|frontend)$/, '')));
        const users = new Set(appContainers
            .map(c => c.Labels['deploy.userId'])
            .filter(u => u && u !== 'anonymous' && u !== 'unknown'));
        const mem = readMeminfo();

        res.json({
            host: {
                cpuPercent: cpu,
                cores: os.cpus().length,
                load: os.loadavg(),
                uptime: os.uptime(),
                memory: { total: mem.total, used: mem.total - mem.available },
                swap: { total: mem.swapTotal, used: mem.swapTotal - mem.swapFree },
                disk: disk ? { total: disk.blocks * disk.bsize, used: (disk.blocks - disk.bfree) * disk.bsize } : null,
            },
            docker: {
                version: info.ServerVersion,
                containers: info.Containers,
                running: info.ContainersRunning,
                images: info.Images,
            },
            platform: {
                deploys: subdomains.size,
                containers: appContainers.length,
                running: appContainers.filter(c => c.State === 'running').length,
                restarting: appContainers.filter(c => c.State === 'restarting').map(c => c.Names[0].slice(1)),
                users: users.size,
                databases: containers.filter(c => c.Names.some(n => n.startsWith('/db-'))).length,
                paused: deploysPaused,
            },
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Monitoreo: consumo por contenedor (más pesado, se consulta cada 30 s) ──
app.get('/admin/resources', ...adminOnly, async (req, res) => {
    try {
        const running = await docker.listContainers();
        const managed = running.filter(c => MANAGED_CONTAINER.test(c.Names[0].slice(1)));
        const results = await Promise.all(managed.map(async (c) => {
            const name = c.Names[0].slice(1);
            try {
                const s = await withTimeout(docker.getContainer(c.Id).stats({ stream: false }), 4000);
                const cache = s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0;
                const memory = Math.max(0, (s.memory_stats?.usage || 0) - cache);
                const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0) - (s.precpu_stats?.cpu_usage?.total_usage || 0);
                const sysDelta = (s.cpu_stats?.system_cpu_usage || 0) - (s.precpu_stats?.system_cpu_usage || 0);
                const cpus = s.cpu_stats?.online_cpus || 1;
                const cpuPercent = sysDelta > 0 ? Math.round((cpuDelta / sysDelta) * cpus * 1000) / 10 : 0;
                return { name, memory, cpuPercent };
            } catch {
                return { name, memory: null, cpuPercent: null };
            }
        }));
        results.sort((a, b) => (b.memory || 0) - (a.memory || 0));
        res.json({ containers: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Deploys de toda la plataforma ──
app.get('/admin/deploys', ...adminOnly, async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const grouped = {};

        for (const c of containers) {
            const name = c.Names[0].slice(1);
            if (!name.startsWith('container-')) continue;
            const L = c.Labels;
            const sub = L['deploy.subdomain'] || name.replace(/^container-/, '').replace(/-(backend|frontend)$/, '');
            const g = grouped[sub] ||= {
                subdomain: sub,
                repo: L['deploy.repo'] || 'unknown',
                branch: L['deploy.branch'] || 'unknown',
                userId: L['deploy.userId'] || 'unknown',
                userEmail: L['deploy.userEmail'] || 'unknown',
                deployedAt: L['deploy.timestamp'] || null,
                database: null,
                containers: [],
            };
            g.containers.push({ name, role: L['deploy.role'] || 'app', state: c.State, status: c.Status });
            if (!g.database && L['deploy.db.type']) g.database = { type: L['deploy.db.type'], name: L['deploy.db.name'] };
            if (L['deploy.timestamp'] && (!g.deployedAt || L['deploy.timestamp'] > g.deployedAt)) g.deployedAt = L['deploy.timestamp'];
        }

        // Bases de datos y Adminer: se agregan a su deploy, o se reportan como huérfanas
        const orphans = [];
        for (const c of containers) {
            const name = c.Names[0].slice(1);
            const m = name.match(/^(db|adminer)-(.+)$/);
            if (!m) continue;
            const entry = { name, role: m[1], state: c.State, status: c.Status };
            if (grouped[m[2]]) grouped[m[2]].containers.push(entry);
            else orphans.push({ ...entry, subdomain: m[2] });
        }

        const deploys = Object.values(grouped).map(g => ({
            ...g,
            health: g.containers.some(x => x.state === 'restarting') ? 'restarting'
                : g.containers.every(x => x.state === 'running') ? 'running' : 'degraded',
        }));
        deploys.sort((a, b) => String(b.deployedAt).localeCompare(String(a.deployedAt)));

        res.json({ deploys, orphans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Logs de un contenedor (de usuario o del sistema) ──
app.get('/admin/containers/:name/logs', ...adminOnly, async (req, res) => {
    const { name } = req.params;
    if (!MANAGED_CONTAINER.test(name) && !SYSTEM_LOG_CONTAINERS.includes(name)) {
        return res.status(400).json({ error: 'Contenedor no permitido' });
    }
    const tail = Math.min(parseInt(req.query.tail, 10) || 200, 1000);
    try {
        const buf = await docker.getContainer(name).logs({ stdout: true, stderr: true, tail, timestamps: true });
        res.json({ name, logs: demuxDockerLogs(buf) });
    } catch (e) {
        res.status(404).json({ error: e.message });
    }
});

// ── Acciones sobre contenedores de usuarios ──
app.post('/admin/containers/:name/:action', ...adminOnly, async (req, res) => {
    const { name, action } = req.params;
    if (!MANAGED_CONTAINER.test(name)) return res.status(400).json({ error: 'Contenedor no permitido' });
    if (!['restart', 'stop', 'start'].includes(action)) return res.status(400).json({ error: 'Acción no válida' });
    try {
        await docker.getContainer(name)[action]();
        audit(req, `container_${action}`, name);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Eliminar un deploy completo (de cualquier usuario) ──
app.delete('/admin/deploys/:subdomain', ...adminOnly, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    try {
        const removed = await removeDeployContainers(subdomain);
        audit(req, 'deploy_delete', subdomain);
        res.json({ ok: true, removed });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Actividad ──
app.get('/admin/activity', ...adminOnly, (req, res) => {
    res.json({ deployEvents, audit: adminAudit });
});

// ── Salud de servicios ──
app.get('/admin/health', ...adminOnly, async (req, res) => {
    const [dockerOk, traefik, webhook, staticServer, cloudflared, web] = await Promise.all([
        docker.ping().then(() => 'ok').catch(() => 'down'),
        checkHttp('http://traefik:8080/api/overview'),
        // adnanh/webhook responde 404 a un hook inexistente: cualquier respuesta = vivo
        checkHttp('http://host.docker.internal:9000/hooks/health-check', () => true),
        containerState('static_server'),
        containerState('cloudflared'),
        containerState('stardest_web'),
    ]);
    res.json({
        paused: deploysPaused,
        checks: [
            { name: 'Docker (docker.sock)', status: dockerOk },
            { name: 'Traefik', status: traefik },
            { name: 'Webhook autodeploy (:9000)', status: webhook },
            { name: 'Static server', status: staticServer },
            { name: 'Cloudflare Tunnel', status: cloudflared },
            { name: 'Frontend StarDest', status: web },
        ],
    });
});

// ── Mantenimiento ──
app.post('/admin/maintenance', ...adminOnly, (req, res) => {
    deploysPaused = !!req.body?.paused;
    audit(req, deploysPaused ? 'deploys_paused' : 'deploys_resumed');
    res.json({ paused: deploysPaused });
});

app.post('/admin/prune', ...adminOnly, async (req, res) => {
    try {
        const r = await docker.pruneImages({ filters: { dangling: ['true'] } });
        audit(req, 'prune_images');
        res.json({ reclaimed: r.SpaceReclaimed || 0, deleted: (r.ImagesDeleted || []).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

### 2c. Extraer la lógica de borrado a una función reutilizable

Agregar esta función (junto a las demás auxiliares):

```javascript
async function removeDeployContainers(subdomain) {
    const containers = await docker.listContainers({ all: true });
    const names = [
        `/container-${subdomain}`,
        `/container-${subdomain}-backend`,
        `/container-${subdomain}-frontend`,
        `/db-${subdomain}`,
        `/adminer-${subdomain}`,
    ];
    const removed = [];
    for (const n of names) {
        const c = containers.find(x => x.Names.includes(n));
        if (c) {
            await docker.getContainer(c.Id).remove({ force: true });
            removed.push(n.slice(1));
        }
    }
    return removed;
}
```

Y que el endpoint existente `DELETE /deploy/:subdomain` la use internamente, conservando sus validaciones de dueño:

```javascript
const removed = await removeDeployContainers(subdomain);
if (removed.length) {
    res.json({ status: 'success', message: `Proyecto ${subdomain} eliminado correctamente.` });
} else {
    res.status(404).json({ status: 'warning', message: 'No se encontró el proyecto.' });
}
```

### 2d. Registrar eventos y respetar la pausa en `POST /deploy`

Dentro de `POST /deploy`, justo después de obtener `userId` / `userEmail` del token:

```javascript
// Pausa de mantenimiento: el admin sí puede desplegar
if (deploysPaused && !isAdminUser(getRequestUser(req))) {
    return res.status(503).json({
        status: 'error',
        code: 'MAINTENANCE',
        details: 'StarDest está en mantenimiento. Intenta de nuevo en unos minutos.',
    });
}

recordDeployEvent('start', { subdomain, userId, userEmail, repoUrl, branch: actualBranch });
```

En el bloque de éxito (después de `deployApp`):

```javascript
recordDeployEvent('success', { subdomain, userId, userEmail, repoUrl });
```

En el `catch`:

```javascript
recordDeployEvent('error', { subdomain, userId, userEmail, repoUrl, error: error.message });
```

En `POST /webhook`, antes de llamar a `deployApp` para un repo de usuario:

```javascript
if (deploysPaused) {
    console.log(`[Webhook] Deploys en pausa — se ignora el push de ${subdomain}`);
    return;
}
recordDeployEvent('webhook', { subdomain, repoUrl, branch: pushBranch });
```

Y en su `catch`:

```javascript
recordDeployEvent('error', { subdomain, repoUrl, error: error.message, source: 'webhook' });
```

En `Deploy.jsx`, manejar el nuevo código junto a los demás errores:

```javascript
if (res.status === 503 && data.code === 'MAINTENANCE') {
    setPhase('error');
    setErrorMessage(data.details);
    return;
}
```

---

## PASO 3 — Frontend

### 3a. Ruta y menú en `App.jsx`

Importar la página y agregar la ruta:

```jsx
import Console from './pages/Console';
// ...
<Route path="/console" element={<Console />} />
```

En el dropdown **Herramientas**, agregar un item **Console** que solo se renderice si el usuario es admin. Debe usar exactamente el mismo estilo que los items existentes del dropdown:

```jsx
{user?.isAdmin && (
    <Link to="/console" /* mismas props/estilos que los otros items de Herramientas */>
        Console
    </Link>
)}
```

`user` viene de `useAuth()`, que ya consume `/api/auth/me` y ahora incluye `isAdmin`.

### 3b. Crear `deploy_panel/apps/web/src/pages/Console.jsx`

```jsx
// Console.jsx — StarDest Console (solo admin)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/* ─── API ─── */
class TotpRequired extends Error {}

async function adminFetch(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
      'X-Admin-Token': sessionStorage.getItem('admin_token') || '',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.code === 'TOTP_REQUIRED') {
    sessionStorage.removeItem('admin_token');
    throw new TotpRequired();
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function adminAction(path, options, onLocked) {
  try {
    return await adminFetch(path, options);
  } catch (e) {
    if (e instanceof TotpRequired) onLocked();
    else alert(e.message);
    return null;
  }
}

function useAdminData(path, onLocked, intervalMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await adminFetch(path));
      setError('');
    } catch (e) {
      if (e instanceof TotpRequired) onLocked();
      else setError(e.message);
    }
  }, [path, onLocked]);
  useEffect(() => {
    load();
    if (!intervalMs) return undefined;
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);
  return { data, error, reload: load };
}

/* ─── Formato ─── */
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
function fmtDuration(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function fmtAgo(v) {
  if (!v) return '—';
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
function repoShort(url) {
  const m = String(url || '').match(/github\.com\/(.+?)(?:\.git)?\/?$/);
  return m ? m[1] : url;
}

/* ─── UI base ─── */
const card = { background: 'var(--px-surface)', border: '1px solid var(--px-border)', borderRadius: 14, padding: 20 };
const muted = { color: 'var(--px-muted)', fontSize: 13 };
const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 });
const btn = (variant = 'default') => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${variant === 'danger' ? 'rgba(239,68,68,0.4)' : 'var(--px-border)'}`,
  background: variant === 'primary' ? 'var(--px-white)' : variant === 'danger' ? 'rgba(239,68,68,0.08)' : 'transparent',
  color: variant === 'primary' ? 'var(--px-bg)' : variant === 'danger' ? '#f87171' : 'var(--px-white)',
});

const STATUS_COLOR = {
  running: '#22c55e', ok: '#22c55e', success: '#22c55e',
  restarting: '#f87171', down: '#f87171', missing: '#f87171', error: '#f87171',
  degraded: '#fbbf24', start: '#fbbf24', webhook: '#60a5fa',
  exited: '#a1a1aa', created: '#a1a1aa', unknown: '#a1a1aa',
};
function Badge({ value }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: STATUS_COLOR[value] || 'var(--px-muted)' }}>
      ● {value}
    </span>
  );
}

function Meter({ label, used, total, bytes = true, sub }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 85 ? '#f87171' : pct > 70 ? '#fbbf24' : '#22c55e';
  return (
    <div style={card}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 10px', color: 'var(--px-white)' }}>{pct.toFixed(0)}%</div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--px-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
      </div>
      <div style={{ ...muted, marginTop: 8, fontSize: 12 }}>
        {bytes ? `${fmtBytes(used)} / ${fmtBytes(total)}` : sub}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: 'var(--px-white)' }}>{value}</div>
      {sub && <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─── Pantalla de código TOTP ─── */
function TotpGate({ onUnlock }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(value) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/totp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Código inválido');
      sessionStorage.setItem('admin_token', data.adminToken);
      onUnlock();
    } catch (e) {
      setError(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...card, width: '100%', maxWidth: 380, padding: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', color: 'var(--px-white)' }}>Console</h1>
        <p style={{ ...muted, margin: '0 0 24px' }}>Ingresa el código de Google Authenticator</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          placeholder="000000"
          style={{
            width: '100%', boxSizing: 'border-box', textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 28, letterSpacing: '0.4em',
            padding: '14px 12px', borderRadius: 10, outline: 'none',
            border: '1px solid var(--px-border)', background: 'var(--px-bg)', color: 'var(--px-white)',
          }}
        />
        {error && <p style={{ color: '#f87171', fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
        {busy && <p style={{ ...muted, margin: '14px 0 0' }}>Verificando...</p>}
      </div>
    </div>
  );
}

/* ─── Modal de logs ─── */
function LogsModal({ name, onClose, onLocked }) {
  const { data, error, reload } = useAdminData(`/containers/${name}/logs?tail=300`, onLocked);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [data]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 1000, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--px-border)' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--px-white)', flex: 1 }}>{name}</span>
          <button style={btn()} onClick={reload}>Actualizar</button>
          <button style={btn()} onClick={onClose}>Cerrar</button>
        </div>
        <pre ref={ref} style={{ margin: 0, padding: 16, height: '60vh', overflow: 'auto', fontSize: 12, lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace", color: 'var(--px-white)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error ? `Error: ${error}` : data ? (data.logs || '(sin logs)') : 'Cargando...'}
        </pre>
      </div>
    </div>
  );
}

/* ─── Monitoreo ─── */
function OverviewTab({ onLocked }) {
  const { data, error } = useAdminData('/overview', onLocked, 10000);
  const { data: res } = useAdminData('/resources', onLocked, 30000);
  if (error) return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;
  const { host, docker, platform } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {platform.paused && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24', fontSize: 14 }}>
          Los deploys nuevos están en pausa (modo mantenimiento).
        </div>
      )}

      <div style={grid(220)}>
        <Meter label="CPU" used={host.cpuPercent} total={100} bytes={false}
          sub={`${host.cores} núcleos · load ${host.load.map(l => l.toFixed(2)).join(' / ')}`} />
        <Meter label="RAM" used={host.memory.used} total={host.memory.total} />
        <Meter label="Swap" used={host.swap.used} total={host.swap.total} />
        {host.disk && <Meter label="Disco" used={host.disk.used} total={host.disk.total} />}
      </div>

      <div style={grid(170)}>
        <Stat label="Deploys" value={platform.deploys} sub={`${platform.running}/${platform.containers} contenedores arriba`} />
        <Stat label="Usuarios con deploys" value={platform.users} />
        <Stat label="Bases de datos" value={platform.databases} />
        <Stat label="Docker" value={`${docker.running}/${docker.containers}`} sub={`${docker.images} imágenes · v${docker.version}`} />
        <Stat label="Uptime del servidor" value={fmtDuration(host.uptime)} />
      </div>

      {platform.restarting.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 8 }}>Contenedores en reinicio continuo</div>
          {platform.restarting.map(n => (
            <div key={n} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--px-white)' }}>{n}</div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 }}>Consumo por contenedor</div>
        {!res ? <p style={muted}>Cargando...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {res.containers.slice(0, 15).map(c => (
              <div key={c.name} style={{ display: 'flex', gap: 12, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ flex: 1, color: 'var(--px-white)' }}>{c.name}</span>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--px-muted)' }}>{c.memory == null ? '—' : fmtBytes(c.memory)}</span>
                <span style={{ width: 70, textAlign: 'right', color: 'var(--px-muted)' }}>{c.cpuPercent == null ? '—' : `${c.cpuPercent}%`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Deploys ─── */
function DeploysTab({ onLocked }) {
  const { data, error, reload } = useAdminData('/deploys', onLocked, 15000);
  const [filter, setFilter] = useState('');
  const [logsFor, setLogsFor] = useState(null);

  if (error) return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  const q = filter.trim().toLowerCase();
  const deploys = data.deploys.filter(d => !q || [d.subdomain, d.repo, d.userEmail, d.userId]
    .some(v => String(v).toLowerCase().includes(q)));

  async function containerAction(name, action) {
    if (action === 'stop' && !confirm(`¿Detener ${name}?`)) return;
    await adminAction(`/containers/${name}/${action}`, { method: 'POST' }, onLocked);
    reload();
  }

  async function removeDeploy(sub) {
    const typed = prompt(`Esto elimina "${sub}" con su base de datos. Escribe el subdominio para confirmar:`);
    if (typed !== sub) return;
    await adminAction(`/deploys/${sub}`, { method: 'DELETE' }, onLocked);
    reload();
  }

  const owner = (d) => (d.userEmail && !['anonymous', 'unknown'].includes(d.userEmail)) ? d.userEmail : d.userId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar por subdominio, repo o usuario..."
        style={{ padding: '10px 14px', fontSize: 14, borderRadius: 10, outline: 'none', border: '1px solid var(--px-border)', background: 'var(--px-surface)', color: 'var(--px-white)' }}
      />
      <div style={muted}>{deploys.length} de {data.deploys.length} deploys</div>

      {deploys.map(d => (
        <div key={d.subdomain} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <a href={`https://${d.subdomain}.stardest.com`} target="_blank" rel="noreferrer"
              style={{ fontSize: 16, fontWeight: 800, color: 'var(--px-white)', textDecoration: 'none' }}>
              {d.subdomain}
            </a>
            <Badge value={d.health} />
            {d.database && <span style={{ ...muted, fontSize: 12 }}>{d.database.type}</span>}
            <span style={{ flex: 1 }} />
            <button style={btn('danger')} onClick={() => removeDeploy(d.subdomain)}>Eliminar</button>
          </div>
          <div style={{ ...muted, fontSize: 12, marginBottom: 12 }}>
            {owner(d)} · {repoShort(d.repo)} · {d.branch} · {fmtAgo(d.deployedAt)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.containers.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--px-bg)' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--px-white)', minWidth: 220 }}>{c.name}</span>
                <Badge value={c.state} />
                <span style={{ ...muted, fontSize: 12, flex: 1 }}>{c.status}</span>
                <button style={btn()} onClick={() => setLogsFor(c.name)}>Logs</button>
                <button style={btn()} onClick={() => containerAction(c.name, 'restart')}>Reiniciar</button>
                {c.state === 'running' || c.state === 'restarting'
                  ? <button style={btn()} onClick={() => containerAction(c.name, 'stop')}>Detener</button>
                  : <button style={btn()} onClick={() => containerAction(c.name, 'start')}>Iniciar</button>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.orphans.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.4)' }}>
          <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>Bases de datos huérfanas</div>
          <div style={{ ...muted, fontSize: 12, marginBottom: 10 }}>Existen sin una app asociada. Probablemente quedaron de deploys fallidos.</div>
          {data.orphans.map(o => (
            <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--px-white)', flex: 1 }}>{o.name}</span>
              <Badge value={o.state} />
              <button style={btn()} onClick={() => setLogsFor(o.name)}>Logs</button>
              <button style={btn('danger')} onClick={() => removeDeploy(o.subdomain)}>Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {logsFor && <LogsModal name={logsFor} onClose={() => setLogsFor(null)} onLocked={onLocked} />}
    </div>
  );
}

/* ─── Actividad ─── */
function ActivityTab({ onLocked }) {
  const { data, error } = useAdminData('/activity', onLocked, 10000);
  if (error) return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 }}>Deploys recientes</div>
        {data.deployEvents.length === 0 && <p style={muted}>Sin eventos desde el último reinicio del panel.</p>}
        {data.deployEvents.map((e, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--px-border)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...muted, fontSize: 12, width: 90 }}>{fmtAgo(e.ts)}</span>
              <Badge value={e.type} />
              <span style={{ fontWeight: 700, color: 'var(--px-white)', fontSize: 14 }}>{e.subdomain}</span>
              <span style={{ ...muted, fontSize: 12 }}>{e.userEmail || e.userId || ''} {e.repoUrl ? `· ${repoShort(e.repoUrl)}` : ''}</span>
            </div>
            {e.error && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#f87171', marginTop: 4, wordBreak: 'break-all' }}>{e.error}</div>
            )}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 }}>Acciones del administrador</div>
        {data.audit.length === 0 && <p style={muted}>Sin acciones registradas.</p>}
        {data.audit.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '6px 0' }}>
            <span style={{ ...muted, fontSize: 12, width: 90 }}>{fmtAgo(a.ts)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--px-white)' }}>{a.action}</span>
            <span style={muted}>{a.target}</span>
            <span style={{ ...muted, marginLeft: 'auto' }}>{a.ip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mantenimiento ─── */
function MaintenanceTab({ onLocked }) {
  const { data, error, reload } = useAdminData('/health', onLocked, 20000);
  const [logsFor, setLogsFor] = useState(null);
  const [pruneResult, setPruneResult] = useState('');

  if (error) return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  async function togglePause() {
    await adminAction('/maintenance', { method: 'POST', body: JSON.stringify({ paused: !data.paused }) }, onLocked);
    reload();
  }

  async function prune() {
    if (!confirm('¿Eliminar imágenes Docker huérfanas (sin tag)?')) return;
    const r = await adminAction('/prune', { method: 'POST' }, onLocked);
    if (r) setPruneResult(`${r.deleted} imágenes eliminadas · ${fmtBytes(r.reclaimed)} liberados`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 }}>Salud de servicios</div>
        {data.checks.map(c => (
          <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--px-border)', fontSize: 14 }}>
            <span style={{ color: 'var(--px-white)' }}>{c.name}</span>
            <Badge value={c.status} />
          </div>
        ))}
      </div>

      <div style={grid(280)}>
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 6 }}>Pausar deploys</div>
          <p style={{ ...muted, marginTop: 0 }}>Los usuarios no podrán desplegar ni se procesarán webhooks. Tú sí puedes desplegar.</p>
          <button style={btn(data.paused ? 'primary' : 'danger')} onClick={togglePause}>
            {data.paused ? 'Reanudar deploys' : 'Pausar deploys'}
          </button>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 6 }}>Limpiar Docker</div>
          <p style={{ ...muted, marginTop: 0 }}>Elimina imágenes sin tag. El cron diario ya lo hace a las 3 am.</p>
          <button style={btn()} onClick={prune}>Limpiar ahora</button>
          {pruneResult && <p style={{ ...muted, color: '#22c55e', marginBottom: 0 }}>{pruneResult}</p>}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 }}>Logs del sistema</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['deploy_panel', 'traefik', 'static_server', 'cloudflared', 'stardest_web'].map(n => (
            <button key={n} style={btn()} onClick={() => setLogsFor(n)}>{n}</button>
          ))}
        </div>
      </div>

      {logsFor && <LogsModal name={logsFor} onClose={() => setLogsFor(null)} onLocked={onLocked} />}
    </div>
  );
}

/* ─── Página ─── */
const TABS = [
  { id: 'overview', label: 'Monitoreo' },
  { id: 'deploys', label: 'Deploys' },
  { id: 'activity', label: 'Actividad' },
  { id: 'maintenance', label: 'Mantenimiento' },
];

export default function Console() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(() => !!sessionStorage.getItem('admin_token'));
  const [tab, setTab] = useState('overview');
  const onLocked = useCallback(() => setUnlocked(false), []);

  useEffect(() => {
    if (!loading && !user?.isAdmin) navigate('/');
  }, [user, loading, navigate]);

  if (loading || !user?.isAdmin) return null;
  if (!unlocked) return <TotpGate onUnlock={() => setUnlocked(true)} />;

  function lock() {
    sessionStorage.removeItem('admin_token');
    setUnlocked(false);
  }

  return (
    <div className="page-transition" style={{ maxWidth: 1200, margin: '0 auto', padding: '110px 24px 60px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: 'var(--px-white)' }}>Console</h1>
          <p style={{ ...muted, margin: '6px 0 0' }}>Administración de StarDest</p>
        </div>
        <button style={btn()} onClick={lock}>Bloquear</button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, marginBottom: 24, width: 'fit-content', maxWidth: '100%', overflowX: 'auto', background: 'var(--px-surface)', border: '1px solid var(--px-border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: tab === t.id ? 'var(--px-bg)' : 'transparent',
            color: tab === t.id ? 'var(--px-white)' : 'var(--px-muted)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab onLocked={onLocked} />}
      {tab === 'deploys' && <DeploysTab onLocked={onLocked} />}
      {tab === 'activity' && <ActivityTab onLocked={onLocked} />}
      {tab === 'maintenance' && <MaintenanceTab onLocked={onLocked} />}
    </div>
  );
}
```

Los estilos usan las variables `--px-*` existentes, así que respetan el tema claro/oscuro actual.

---

## PASO 4 — Configuración en el servidor (lo hace Angel, en este orden)

Esto va **después** de que Antigravity haga push y el webhook reconstruya `deploy_panel`, porque el paso 4.1 necesita `otplib` dentro del contenedor.

### 4.1 Generar el secreto TOTP y escanearlo

```bash
docker exec deploy_panel node -e "
const { authenticator } = require('otplib');
const QR = require('qrcode');
const secret = authenticator.generateSecret();
const uri = authenticator.keyuri('AngelCoronaaa', 'StarDest Console', secret);
console.log('ADMIN_TOTP_SECRET=' + secret);
QR.toString(uri, { type: 'terminal', small: true }, (e, s) => console.log(s));
"
```

1. Escanea el QR con Google Authenticator. Si la terminal no lo dibuja bien, en la app elige *Ingresar clave de configuración* y escribe el secreto a mano (tipo: basada en tiempo).
2. Guarda el valor `ADMIN_TOTP_SECRET` para el paso 4.3.
3. Limpia la terminal con `clear`.

### 4.2 Generar el secreto de sesión

```bash
openssl rand -hex 32
```

### 4.3 Agregar las variables a `~/deploys/docker-compose.yml`

En el servicio `deploy_panel`, dentro de `environment`, con el mismo formato que las variables existentes:

```yaml
      - ADMIN_GITHUB_IDS=228611465
      - ADMIN_TOTP_SECRET=<el secreto del paso 4.1>
      - ADMIN_SESSION_SECRET=<el valor del paso 4.2>
```

Y si `deploy_panel` no lo tiene ya, agregar en el mismo servicio (para que el check del webhook funcione):

```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 4.4 Aplicar y verificar

```bash
cd ~/deploys && docker compose config --quiet && docker compose up -d deploy_panel
docker exec deploy_panel sh -c 'echo "admins: $ADMIN_GITHUB_IDS · totp: ${ADMIN_TOTP_SECRET:+configurado}"'
```

Debe imprimir `admins: 228611465 · totp: configurado`.

### 4.5 Probar

1. Cierra sesión en StarDest y vuelve a entrar **con GitHub** (para que `/auth/me` devuelva `isAdmin: true`).
2. **Herramientas → Console**, ingresa el código de 6 dígitos.
3. Con otra cuenta (o con tu login de Google), confirma que **Console no aparece** y que `stardest.com/console` redirige al inicio.

---

## Resumen de cambios

| Acción | Archivo / lugar |
|---|---|
| Instalar | `otplib@12`, `qrcode` en `deploy_panel` |
| Modificar | `apps/builder/index.js`: `/auth/me` devuelve `isAdmin` |
| Agregar | `apps/builder/index.js`: sección Console completa (middlewares, TOTP, endpoints `/admin/*`) |
| Agregar | `apps/builder/index.js`: `removeDeployContainers` y usarla en `DELETE /deploy/:subdomain` |
| Modificar | `apps/builder/index.js`: `POST /deploy` y `POST /webhook` registran eventos y respetan la pausa |
| Modificar | `apps/web/src/pages/Deploy.jsx`: manejar `MAINTENANCE` (503) |
| Crear | `apps/web/src/pages/Console.jsx` |
| Modificar | `apps/web/src/App.jsx`: ruta `/console` + item **Console** en Herramientas solo si `user.isAdmin` |
| Servidor | Generar `ADMIN_TOTP_SECRET` y `ADMIN_SESSION_SECRET`; agregar 3 variables (+ `extra_hosts`) al compose; recrear `deploy_panel` |

## Notas

- **Si pierdes el teléfono:** vuelve a correr el comando del paso 4.1, reemplaza `ADMIN_TOTP_SECRET` en el compose y recrea `deploy_panel`. El secreto anterior deja de servir. Conviene respaldar el secreto (o usar la exportación de cuentas de Google Authenticator).
- **Si falta alguna variable, la Console falla cerrada:** el TOTP responde 503 y nadie entra.
- **Lo que vive en memoria se reinicia junto con el panel:** actividad, bitácora, pausa e intentos de TOTP. Para historial permanente habría que persistirlo (archivo o Redis).
- **Detener vs reiniciar:** los contenedores de usuarios tienen `RestartPolicy: always`. Un contenedor detenido desde la Console sigue detenido, pero vuelve a arrancar si se reinicia el servidor o Docker.
- **Las métricas de CPU, RAM, swap y uptime son del host**, porque el contenedor lee el `/proc` del servidor. El disco medido es la partición donde está `~/deploys`.
- **Si la verificación del webhook sale `unknown`:** `deploy_panel` no resuelve `host.docker.internal`. Revisa el `extra_hosts` del paso 4.3.
