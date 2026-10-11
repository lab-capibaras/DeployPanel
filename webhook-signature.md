# Instrucciones: Webhooks firmados (X-Hub-Signature-256)

## Problema

Desde que `https://stardest.com/webhook` llega al backend, cualquiera puede mandar un POST que *parezca* un push de GitHub y forzar el redeploy de cualquier proyecto. Basta con conocer la URL del repo. Además hay tres fallas relacionadas:

1. **El redeploy por webhook pierde al dueño.** Hoy se llama `deployApp(repoUrl, subdomain, pushBranch)` sin usuario, así que el contenedor nuevo queda como `anonymous`. El deploy desaparece del Dashboard de su dueño y pierde sus variables de entorno.
2. **Un mismo repo puede estar desplegado en varios subdominios** (por ejemplo IAUCOL en `iaucol`, `i-an`, `iucol` e `ianucol`), pero `deployments.json` guarda un solo subdominio por repo y rama. El último deploy pisa a los demás. Además ese archivo vive dentro del contenedor y se pierde en cada rebuild del panel.
3. **El endpoint tiene una rama especial para el repo DeployPanel** que ejecuta `git pull` y `npm install` y luego reinicia el proceso (`process.exit`). Cualquiera podría reiniciar el panel en bucle con un POST falso. Esa rama tampoco funciona, porque no hay `docker` dentro del contenedor. Las actualizaciones del panel ya van por `/hooks/update-test`.

## Diseño

- **Un secreto por deploy.** Cada subdominio tiene su propio secreto HMAC. Un secreto global no serviría, porque todos los usuarios lo verían en su modal y cualquiera podría firmar pushes falsos para los repos de otros.
- **Validación obligatoria.** Todo push debe traer `X-Hub-Signature-256` válida con el secreto del deploy. Como hasta hoy ningún webhook de usuario había funcionado (respondían 405), no se rompe ninguna configuración existente.
- **Los secretos se guardan en un archivo persistente** (carpeta montada), no en labels de Docker. Así se pueden generar para deploys que ya existen sin redesplegarlos y no aparecen en `docker inspect`.
- **Búsqueda por labels de los contenedores** (`deploy.repo` + `deploy.branch`) en lugar de `deployments.json`. Encuentra todos los subdominios de un mismo repo, y la firma decide cuál se redespliega: cada webhook de GitHub firma con el secreto de su propio deploy.
- **El redeploy conserva dueño y variables de entorno**, leyéndolos de los labels del contenedor actual.
- **Un push que llega mientras se construye ese mismo deploy** se encola y corre al terminar, en lugar de lanzar dos builds a la vez.

---

## PASO 1 — Servidor: carpeta persistente para los secretos

```bash
mkdir -p ~/deploys/webhooks && chmod 777 ~/deploys/webhooks
```

En `~/deploys/docker-compose.yml`, en los `volumes` de `deploy_panel`, junto al de `boards`:

```yaml
      - ./webhooks:/home/project/deploys/webhooks
```

Este paso se aplica junto con el rebuild del paso 2.

---

## PASO 2 — Backend: `deploy_panel/apps/builder/index.js`

### 2a. Guardar el body crudo

La firma se calcula sobre los bytes exactos que mandó GitHub, no sobre el JSON ya parseado. Reemplazar los parsers de body:

```javascript
// ANTES:
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// DESPUÉS:
const keepRawBody = (req, _res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: '1mb', verify: keepRawBody }));
app.use(express.urlencoded({ extended: true, verify: keepRawBody }));
```

### 2b. `normalizeUrl` también quita la barra final

Algunos deploys guardaron el repo como `https://github.com/usuario/repo/` y GitHub lo manda sin barra, así que nunca coincidían:

```javascript
function normalizeUrl(url) {
    return String(url || '').trim()
        .replace(/\/+$/, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '')
        .toLowerCase();
}
```

### 2c. Secretos por deploy

Agregar junto a las demás funciones auxiliares:

```javascript
// ── Secretos de webhook por deploy ──
const WEBHOOKS_DIR = path.join(process.env.DEPLOYS_DIR || '/home/project/deploys', 'webhooks');
const WEBHOOK_SECRETS_FILE = path.join(WEBHOOKS_DIR, 'secrets.json');

function readWebhookSecrets() {
    try {
        return JSON.parse(fs.readFileSync(WEBHOOK_SECRETS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function writeWebhookSecrets(data) {
    fs.mkdirSync(WEBHOOKS_DIR, { recursive: true });
    const tmp = `${WEBHOOK_SECRETS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, WEBHOOK_SECRETS_FILE);
}

function getOrCreateWebhookSecret(subdomain, { rotate = false } = {}) {
    const all = readWebhookSecrets();
    if (!all[subdomain] || rotate) {
        all[subdomain] = { secret: crypto.randomBytes(24).toString('hex'), createdAt: new Date().toISOString() };
        writeWebhookSecrets(all);
    }
    return all[subdomain].secret;
}

function deleteWebhookSecret(subdomain) {
    const all = readWebhookSecrets();
    if (all[subdomain]) {
        delete all[subdomain];
        writeWebhookSecrets(all);
    }
}

// Comparación en tiempo constante para no filtrar información por tiempos de respuesta
function verifyGithubSignature(rawBody, header, secret) {
    if (!rawBody || !header || !String(header).startsWith('sha256=')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(String(header));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Si el archivo no importa `crypto` arriba, agregar `const crypto = require('crypto');`.

### 2d. Reemplazar por completo `POST /webhook`

Borrar el handler actual, incluida la rama del repo DeployPanel con `git pull` y `process.exit`, y poner esto:

```javascript
// ── Webhook de GitHub (push → redeploy) ──
const webhookRunning = new Set();  // subdominios construyéndose por webhook
const webhookPending = new Set();  // subdominios con otro push en cola

async function runWebhookRedeploy(job) {
    const { subdomain } = job;
    if (webhookRunning.has(subdomain)) {
        webhookPending.add(subdomain);
        console.log(`[Webhook] ${subdomain} ya se está construyendo; el push queda en cola`);
        return;
    }
    webhookRunning.add(subdomain);
    try {
        if (deploysPaused) {
            console.log(`[Webhook] Deploys en pausa — se ignora el push de ${subdomain}`);
            return;
        }
        recordDeployEvent('webhook', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, branch: job.branch });
        await deployApp(job.repoUrl, subdomain, job.branch, job.userId, job.userEmail, job.userEnv);
        recordDeployEvent('success', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, source: 'webhook' });
        console.log(`[Webhook] ${subdomain} actualizado con éxito`);
    } catch (e) {
        recordDeployEvent('error', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, error: e.message, source: 'webhook' });
        console.error(`[Webhook] Error actualizando ${subdomain}: ${e.message}`);
    } finally {
        webhookRunning.delete(subdomain);
        if (webhookPending.delete(subdomain)) runWebhookRedeploy(job); // hubo otro push durante el build
    }
}

app.post('/webhook', async (req, res) => {
    const event = req.headers['x-github-event'];
    if (event === 'ping') return res.status(200).send('pong');
    if (event !== 'push') return res.status(200).send('Evento ignorado');

    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !req.rawBody) return res.status(401).send('Firma requerida');

    // Soporta content type JSON y form-urlencoded
    let payload = req.body;
    try {
        if (typeof req.body?.payload === 'string') payload = JSON.parse(req.body.payload);
    } catch {
        return res.status(400).send('Payload inválido');
    }

    const repoUrl = payload?.repository?.html_url;
    const branch = String(payload?.ref || '').replace('refs/heads/', '');
    if (!repoUrl || !branch) return res.status(400).send('Payload incompleto');

    try {
        // Todos los deploys de este repo y rama, con dueño y variables de entorno
        const containers = await docker.listContainers({ all: true });
        const candidates = new Map();
        for (const c of containers) {
            const name = c.Names[0].slice(1);
            if (!name.startsWith('container-')) continue;
            const L = c.Labels;
            if (!L['deploy.repo'] || normalizeUrl(L['deploy.repo']) !== normalizeUrl(repoUrl)) continue;
            if ((L['deploy.branch'] || 'main') !== branch) continue;
            const sub = L['deploy.subdomain'] || name.replace(/^container-/, '').replace(/-(backend|frontend)$/, '');
            if (candidates.has(sub)) continue;
            let userEnv = [];
            try { userEnv = JSON.parse(L['deploy.userEnv'] || '[]'); } catch { userEnv = []; }
            candidates.set(sub, {
                subdomain: sub,
                repoUrl: L['deploy.repo'],
                branch,
                userId: L['deploy.userId'] || 'anonymous',
                userEmail: L['deploy.userEmail'] || 'anonymous',
                userEnv,
            });
        }

        // La firma decide qué deploy(s) disparar: cada webhook firma con el secreto de su subdominio
        const secrets = readWebhookSecrets();
        const matched = [...candidates.values()].filter(job =>
            secrets[job.subdomain] && verifyGithubSignature(req.rawBody, signature, secrets[job.subdomain].secret));

        if (matched.length === 0) {
            console.warn(`[Webhook] Push rechazado para ${repoUrl}#${branch} (firma inválida o deploy inexistente)`);
            return res.status(401).send('Firma inválida o deploy no encontrado');
        }

        res.status(202).send(`Redeploy iniciado: ${matched.map(j => j.subdomain).join(', ')}`);
        for (const job of matched) runWebhookRedeploy(job);
    } catch (e) {
        console.error('[Webhook] Error:', e.message);
        if (!res.headersSent) res.status(500).send('Error interno');
    }
});
```

`deploysPaused` y `recordDeployEvent` vienen de la sección Console, y `requireUser` de la sección Board. Como el webhook ya no depende de `deployments.json`, el `saveDeployment(...)` de `POST /deploy` puede quedarse o quitarse sin efecto.

### 2e. Endpoints para que el dueño obtenga su secreto

```javascript
async function findOwnedDeploy(subdomain, user) {
    const containers = await docker.listContainers({ all: true });
    const names = [`/container-${subdomain}`, `/container-${subdomain}-backend`, `/container-${subdomain}-frontend`];
    return containers.find(c =>
        c.Names.some(n => names.includes(n)) && c.Labels['deploy.userId'] === String(user.id));
}

// Ver (o crear) el secreto del webhook de un deploy propio
app.get('/deploys/:subdomain/webhook', requireUser, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    if (!(await findOwnedDeploy(subdomain, req.user))) return res.status(404).json({ error: 'Deploy no encontrado' });
    res.json({
        url: 'https://stardest.com/webhook',
        secret: getOrCreateWebhookSecret(subdomain),
        contentType: 'application/json',
    });
});

// Generar un secreto nuevo (el anterior deja de servir)
app.post('/deploys/:subdomain/webhook/rotate', requireUser, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    if (!(await findOwnedDeploy(subdomain, req.user))) return res.status(404).json({ error: 'Deploy no encontrado' });
    res.json({ secret: getOrCreateWebhookSecret(subdomain, { rotate: true }) });
});
```

### 2f. Borrar el secreto al eliminar un deploy

En `removeDeployContainers` (de la sección Console), al final, antes del `return removed;`:

```javascript
deleteWebhookSecret(subdomain);
```

Así, si alguien crea después un deploy con el mismo subdominio, no hereda el secreto anterior.

---

## PASO 3 — Frontend

### 3a. `WebhookInstructions.jsx`: mostrar el secreto

Agregar estado y carga del secreto:

```jsx
const [hook, setHook] = useState(null);
const [secretCopied, setSecretCopied] = useState(false);

useEffect(() => {
    fetch(`/api/deploys/${subdomain}/webhook`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    })
        .then(r => (r.ok ? r.json() : null))
        .then(setHook)
        .catch(() => setHook(null));
}, [subdomain]);

async function rotateSecret() {
    if (!confirm('El secreto actual dejará de funcionar y tendrás que actualizarlo en GitHub. ¿Continuar?')) return;
    const r = await fetch(`/api/deploys/${subdomain}/webhook/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    });
    if (r.ok) {
        const d = await r.json();
        setHook(h => ({ ...h, secret: d.secret }));
    }
}
```

Actualizar la lista de pasos, agregando el del secreto:

1. Ve a tu repositorio en GitHub
2. Settings → Webhooks → Add webhook
3. Pega la URL de abajo en "Payload URL"
4. Content type: `application/json`
5. **Secret: pega el secreto de abajo**
6. Events: Just the push event
7. Activa el webhook y guarda

Y debajo del bloque de la URL, un bloque igual para el secreto, reutilizando el mismo estilo del input y del botón Copy que ya existen:

```jsx
{hook?.secret && (
    <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--px-muted)' }}>Secret</div>
        <div style={{ display: 'flex', gap: 8 }}>
            <code /* mismo estilo que el bloque de la URL */>{hook.secret}</code>
            <button /* mismo estilo que el botón Copy */
                onClick={() => {
                    navigator.clipboard.writeText(hook.secret);
                    setSecretCopied(true);
                    setTimeout(() => setSecretCopied(false), 2000);
                }}>
                {secretCopied ? 'Copied' : 'Copy'}
            </button>
        </div>
        <button onClick={rotateSecret}
            style={{ marginTop: 8, fontSize: 12, background: 'none', border: 'none', color: 'var(--px-muted)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            Generar nuevo secreto
        </button>
    </div>
)}
```

Si el modal usa el sistema de traducciones (i18n), agregar los textos nuevos ahí en lugar de dejarlos fijos.

Agregar también una prop opcional `title`, para reutilizar el modal desde el Dashboard (paso 3b):

```jsx
export default function WebhookInstructions({ subdomain, repoUrl, onClose, title }) {
    // ... en el encabezado:
    // {title || '<texto actual de "Deployment successful">'}
```

### 3b. `Dashboard.jsx`: botón "Webhook" en cada deploy

Los deploys que ya existen necesitan una forma de obtener su secreto. En cada card de deploy con repo (no en los subidos por zip):

```jsx
import WebhookInstructions from '../components/WebhookInstructions';

// estado del componente:
const [webhookFor, setWebhookFor] = useState(null);

// en las acciones de la card, solo si deploy.repo no es 'unknown' ni 'zip-upload':
<button onClick={() => setWebhookFor(deploy)} /* mismo estilo que Redeploy */>Webhook</button>

// al final del JSX:
{webhookFor && (
    <WebhookInstructions
        subdomain={webhookFor.subdomain}
        repoUrl={webhookFor.repo}
        title={`Webhook de ${webhookFor.subdomain}`}
        onClose={() => setWebhookFor(null)}
    />
)}
```

---

## PASO 4 — El webhook del propio panel (`/hooks/update-test`)

El webhook del host (adnanh/webhook) que reconstruye todo StarDest también es público. Cualquiera puede llamar a `https://stardest.com/hooks/update-test` y forzar rebuilds del panel. Esto se configura en el servidor, no en el código.

**1. Generar un secreto:**

```bash
openssl rand -hex 32
```

**2. Agregar la validación al hook `update-test`** en `~/deploys/hooks.json`, sin tocar los demás campos:

```json
{
  "id": "update-test",
  "...": "campos existentes sin cambios",
  "trigger-rule": {
    "match": {
      "type": "payload-hmac-sha256",
      "secret": "EL_SECRETO_GENERADO",
      "parameter": { "source": "header", "name": "X-Hub-Signature-256" }
    }
  }
}
```

No agregar esta regla al hook `deploy-static`: ese lo llama el panel internamente y dejaría de funcionar.

**3. Reiniciar el servicio:**

```bash
sudo systemctl restart webhook && sudo systemctl status webhook --no-pager | head -5
```

**4. Poner el mismo secreto en GitHub:** repo **DeployPanel → Settings → Webhooks →** el webhook de `/hooks/update-test` **→ Secret** → guardar.

**5. Verificar:** haz un push a `test` y revisa:

```bash
tail -20 ~/deploys/webhook.log
```

Debe decir `update-test got matched`. Si dice `didn't match its rules`, el secreto de GitHub y el de `hooks.json` no coinciden.

---

## PASO 5 — Aplicar y probar

```bash
cd ~/deploys && docker compose config --quiet && docker compose up -d deploy_panel
docker exec deploy_panel sh -c 'touch /home/project/deploys/webhooks/.t && rm /home/project/deploys/webhooks/.t && echo escritura ok'
```

**Un push sin firma debe rechazarse:**

```bash
curl -s -w "\n[%{http_code}]\n" -X POST https://stardest.com/webhook \
  -H "Content-Type: application/json" -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main","repository":{"html_url":"https://github.com/lab-capibaras/OnlineChat"}}'
```

Debe responder `Firma requerida [401]`.

**Prueba real:**

1. En el Dashboard, en uno de tus deploys, abre **Webhook** y copia URL y Secret.
2. En GitHub, en el webhook de ese repo, pega el Secret y guarda.
3. Haz un commit vacío y push:

```bash
git commit --allow-empty -m "test webhook" && git push
```

4. En el servidor:

```bash
docker logs deploy_panel --tail 30 | grep -i webhook
```

Debe aparecer el redeploy. En el Dashboard, el deploy debe seguir siendo tuyo, con sus variables de entorno.

---

## Resumen de cambios

| Acción | Archivo / lugar |
|---|---|
| Servidor | Crear `~/deploys/webhooks` (`chmod 777`) y montarla en `deploy_panel` |
| Modificar | `index.js`: parsers con `verify` para guardar `req.rawBody` |
| Modificar | `index.js`: `normalizeUrl` quita barras finales |
| Agregar | `index.js`: secretos por deploy y `verifyGithubSignature` |
| Reemplazar | `index.js`: `POST /webhook` completo (firma obligatoria, varios subdominios, conserva dueño y variables, cola por deploy; sin la rama de DeployPanel) |
| Agregar | `index.js`: `GET /deploys/:subdomain/webhook` y `POST .../rotate` (solo el dueño) |
| Modificar | `index.js`: `removeDeployContainers` borra el secreto |
| Modificar | `WebhookInstructions.jsx`: paso y bloque del secreto, rotación, prop `title` |
| Modificar | `Dashboard.jsx`: botón **Webhook** por deploy |
| Servidor | `hooks.json`: firma obligatoria en `update-test` + mismo secreto en GitHub |

## Notas

- **El secreto lo ve solo el dueño del deploy**, nunca se manda a otros usuarios y no aparece en los labels de Docker.
- **Si un usuario borra un deploy y lo vuelve a crear**, se genera un secreto nuevo y debe actualizarlo en GitHub. El modal se lo muestra al terminar el deploy.
- **Varios webhooks en un mismo repo** (un repo desplegado en varios subdominios) funcionan bien: cada push llega firmado por cada webhook con su propio secreto, y solo se redespliega el deploy correspondiente.
- **Hook `deploy-static`:** también es público vía `/hooks/`. Como solo reconstruye sitios estáticos que ya existen, el riesgo es menor, pero en el futuro conviene protegerlo con un header secreto que mande el panel.
