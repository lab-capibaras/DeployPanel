# Instrucciones de implementación: Static Site Hosting (Netlify-style)

## Para la IA que implemente esto

Este documento contiene **instrucciones exactas y archivos completos** para agregar soporte de hosting de sitios estáticos al proyecto DeployPanel (https://github.com/lab-capibaras/DeployPanel, rama `test`).

Hay dos modos de deploy que debes implementar:
1. **Git-based**: conectar un repositorio, cada push hace deploy automático
2. **Drag & drop**: el usuario sube un `.zip` o carpeta desde el navegador

Lee este documento completo antes de tocar cualquier archivo. Sigue las instrucciones en el orden en que aparecen.

---

## Contexto del proyecto

```
/home/project/deploys/
├── docker-compose.yml       ← orquesta todos los servicios
├── hooks.json               ← config del servidor de webhooks (adnanh/webhook v2.8.0)
├── update_web.sh            ← script de deploy del frontend propio
├── traefik_dynamic.yml      ← rutas estáticas de Traefik (webhooks → host)
├── deploy_panel/            ← monorepo Node.js
│   ├── apps/
│   │   ├── builder/
│   │   │   └── index.js     ← entrypoint del backend Express (puerto 4000)
│   │   └── web/             ← frontend Vite + React
│   └── templates/
│       └── Dockerfile       ← Dockerfile del backend
├── NodeServer/              ← app Node.js de usuario
└── PhpServer/               ← app PHP de usuario
```

**Stack:**
- Traefik v2.11 como reverse proxy (enruta por Host/PathPrefix)
- Cloudflared como túnel
- adnanh/webhook corriendo en el **host** en puerto 9000
- deploy_panel: backend Express en puerto 4000, accesible en `/api/*` (Traefik strip prefix `/api`)
- web_frontend: app Vite/React servida con nginx

---

## PASO 1 — Crear directorios en el servidor

Ejecutar en el servidor antes de cualquier otra cosa:

```bash
mkdir -p /home/project/deploys/static_sites
mkdir -p /home/project/deploys/nginx_configs
```

---

## PASO 2 — Reemplazar `docker-compose.yml`

**Ruta:** `/home/project/deploys/docker-compose.yml`
**Acción:** reemplazar el archivo completo con este contenido.

Cambios respecto al original:
- `deploy_panel`: se agregan dos volúmenes nuevos (`static_sites` y `nginx_configs`) para que el backend pueda escribir en ellos
- `node_app`: se agrega `priority=10` al router de Traefik
- `php_app`: se agrega `priority=10` al router de Traefik
- Se agrega el servicio `static_server` (nginx:alpine) con `priority=2`

> **Por qué los priorities:** el `HostRegexp` del `static_server` tiene una cadena de regla más larga que los `Host()` específicos. En Traefik v2 la prioridad por defecto se calcula por longitud de la regla, por lo que sin prioridades explícitas el wildcard ganaría sobre las rutas específicas de node y php.

```yaml
services:
  traefik:
    image: traefik:v2.11
    container_name: traefik
    extra_hosts:
      - "host.docker.internal:host-gateway"
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--providers.docker.network=deploys_internal_network"
      - "--providers.file.filename=/traefik_dynamic.yml"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik_dynamic.yml:/traefik_dynamic.yml:ro
    networks:
      - internal_network
    restart: always

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel --no-autoupdate run --token (TOKEN)
    networks:
      - internal_network
    restart: always

  # --- FRONTEND ---
  web_frontend:
    build:
      context: ./deploy_panel/apps/web
      dockerfile: Dockerfile
    container_name: stardest_web
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web-router.rule=Host(`stardest.com`)"
      - "traefik.http.routers.web-router.priority=1"
      - "traefik.http.services.web-service.loadbalancer.server.port=80"

  # --- BACKEND (PANEL) ---
  deploy_panel:
    build:
      context: ./deploy_panel
      dockerfile: templates/Dockerfile
    container_name: deploy_panel
    working_dir: /app
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./static_sites:/home/project/deploys/static_sites
      - ./nginx_configs:/home/project/deploys/nginx_configs
    command: node apps/builder/index.js
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.panel-api.rule=Host(`stardest.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.panel-api.priority=20"
      - "traefik.http.routers.panel-deploy-post.rule=Host(`stardest.com`) && PathPrefix(`/deploy`) && Method(`POST`)"
      - "traefik.http.routers.panel-deploy-post.priority=25"
      - "traefik.http.services.panel-service.loadbalancer.server.port=4000"
      - "traefik.http.middlewares.api-strip.stripprefix.prefixes=/api"
      - "traefik.http.routers.panel-api.middlewares=api-strip"

  # --- NODE APP ---
  node_app:
    image: node:20-slim
    container_name: node_app
    working_dir: /app
    volumes:
      - ./NodeServer:/app
    command: node index.js
    restart: unless-stopped
    networks:
      - internal_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.node-router.rule=Host(`node.stardest.com`)"
      - "traefik.http.routers.node-router.entrypoints=web"
      - "traefik.http.routers.node-router.priority=10"
      - "traefik.http.services.node-service.loadbalancer.server.port=3000"

  # --- PHP APP ---
  php_app:
    image: php:8.3-apache
    container_name: php_app
    volumes:
      - ./PhpServer:/var/www/html
    restart: unless-stopped
    networks:
      - internal_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.php-router.rule=Host(`php.stardest.com`)"
      - "traefik.http.routers.php-router.entrypoints=web"
      - "traefik.http.routers.php-router.priority=10"
      - "traefik.http.services.php-service.loadbalancer.server.port=80"

  # --- STATIC SITES (Netlify-style) ---
  static_server:
    image: nginx:alpine
    container_name: static_server
    volumes:
      - ./static_sites:/srv/static:ro
      - ./nginx_configs:/etc/nginx/conf.d:ro
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.static-router.rule=HostRegexp(`{sub:[a-z0-9-]+}.stardest.com`)"
      - "traefik.http.routers.static-router.entrypoints=web"
      - "traefik.http.routers.static-router.priority=2"
      - "traefik.http.services.static-service.loadbalancer.server.port=80"

networks:
  internal_network:
    name: deploys_internal_network
    driver: bridge
```

---

## PASO 3 — Reemplazar `hooks.json`

**Ruta:** `/home/project/deploys/hooks.json`
**Acción:** reemplazar el archivo completo.

Se agrega el hook `deploy-static` que lee el campo `site` del body JSON del POST y lo pasa como argumento al script.

```json
[
  {
    "id": "update-test",
    "execute-command": "/home/project/deploys/update_web.sh",
    "command-working-directory": "/home/project/deploys"
  },
  {
    "id": "deploy-static",
    "execute-command": "/home/project/deploys/deploy_static.sh",
    "command-working-directory": "/home/project/deploys",
    "pass-arguments-to-command": [
      {
        "source": "payload",
        "name": "site"
      }
    ]
  }
]
```

Después de modificar `hooks.json` hay que reiniciar el proceso de webhook en el host para que recargue la config.

---

## PASO 4 — Crear `deploy_static.sh`

**Ruta:** `/home/project/deploys/deploy_static.sh`
**Acción:** crear archivo nuevo.
**Permisos:** ejecutar `chmod +x /home/project/deploys/deploy_static.sh` después de crearlo.

Este script maneja el deploy git-based: clona o actualiza el repo, corre el build dentro de un contenedor Docker efímero (sin necesitar Node en el host), copia los archivos al volumen del `static_server`, genera la config nginx si no existe, y recarga nginx.

```bash
#!/bin/bash
set -e

SITE_NAME=$1
DEPLOYS_DIR="/home/project/deploys"
PROJECTS_FILE="$DEPLOYS_DIR/static_projects.json"

if [ -z "$SITE_NAME" ]; then
    echo "Error: se requiere el nombre del sitio como primer argumento."
    exit 1
fi

REPO=$(jq -r ".[\"$SITE_NAME\"].repo"                         "$PROJECTS_FILE")
BRANCH=$(jq -r ".[\"$SITE_NAME\"].branch // \"main\""         "$PROJECTS_FILE")
BUILD_CMD=$(jq -r ".[\"$SITE_NAME\"].build_cmd // \"\""       "$PROJECTS_FILE")
OUTPUT_DIR=$(jq -r ".[\"$SITE_NAME\"].output_dir // \"dist\"" "$PROJECTS_FILE")

if [ "$REPO" = "null" ] || [ -z "$REPO" ]; then
    echo "Error: sitio '$SITE_NAME' no encontrado en static_projects.json"
    exit 1
fi

echo "== Desplegando sitio estático: $SITE_NAME =="

TEMP_DIR="/tmp/static_build_$SITE_NAME"
STATIC_OUT="$DEPLOYS_DIR/static_sites/$SITE_NAME"
NGINX_CONF="$DEPLOYS_DIR/nginx_configs/$SITE_NAME.conf"

# 1. Clonar o actualizar repositorio
if [ -d "$TEMP_DIR/.git" ]; then
    echo "Actualizando repo..."
    cd "$TEMP_DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
else
    echo "Clonando repo..."
    rm -rf "$TEMP_DIR"
    git clone --branch "$BRANCH" --depth 1 "$REPO" "$TEMP_DIR"
fi

# 2. Build dentro de Docker (no requiere Node en el host)
if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
    echo "Construyendo con: $BUILD_CMD"
    docker run --rm \
        -v "$TEMP_DIR:/app" \
        -w /app \
        node:20-alpine \
        sh -c "npm install --silent && $BUILD_CMD"
    BUILD_SRC="$TEMP_DIR/$OUTPUT_DIR"
else
    BUILD_SRC="$TEMP_DIR"
fi

# 3. Copiar archivos al volumen del static_server
echo "Copiando archivos estáticos..."
mkdir -p "$STATIC_OUT"
rsync -a --delete "$BUILD_SRC/" "$STATIC_OUT/"

# 4. Crear config nginx si no existe
if [ ! -f "$NGINX_CONF" ]; then
    echo "Creando config nginx para $SITE_NAME.stardest.com..."
    cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $SITE_NAME.stardest.com;
    root /srv/static/$SITE_NAME;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
fi

# 5. Recargar nginx sin downtime
echo "Recargando nginx..."
docker exec static_server nginx -s reload

echo "Deploy completado: https://$SITE_NAME.stardest.com"
```

---

## PASO 5 — Crear `static_projects.json`

**Ruta:** `/home/project/deploys/static_projects.json`
**Acción:** crear archivo nuevo.

Registro de proyectos estáticos con deploy git-based. Campos:
- `repo`: URL del repositorio (requerido)
- `branch`: rama a desplegar (default `"main"`)
- `build_cmd`: comando de build, ej. `"npm run build"`. Vacío = servir archivos tal cual sin compilar
- `output_dir`: carpeta de salida del build (default `"dist"`)

```json
{
  "ejemplo": {
    "repo": "https://github.com/tuusuario/mi-sitio",
    "branch": "main",
    "build_cmd": "npm run build",
    "output_dir": "dist"
  }
}
```

---

## PASO 6 — Crear `nginx_configs/default.conf`

**Ruta:** `/home/project/deploys/nginx_configs/default.conf`
**Acción:** crear archivo nuevo.

Config fallback del `static_server`. Devuelve 404 si ningún `server_name` coincide con la petición.

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 404;
}
```

---

## PASO 7 — Crear `upload-static.js` en el backend

**Ruta:** `deploy_panel/apps/builder/upload-static.js`
**Acción:** crear archivo nuevo.

M�dulo Express con los endpoints para drag & drop. Usa el Docker socket (ya montado en el contenedor de `deploy_panel`) para recargar nginx vía `dockerode`, sin necesitar el binario `docker` dentro del contenedor.

Antes de crear el archivo, instalar dependencias en `deploy_panel/`:
```bash
npm install multer adm-zip fs-extra dockerode
```

```javascript
// upload-static.js
// Montar en el entrypoint principal:
//   const uploadStatic = require('./upload-static');
//   app.use(uploadStatic);

const express  = require('express');
const multer   = require('multer');
const AdmZip   = require('adm-zip');
const fs       = require('fs-extra');
const path     = require('path');
const Docker   = require('dockerode');

const router = express.Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const STATIC_BASE   = '/home/project/deploys/static_sites';
const NGINX_CONFIGS = '/home/project/deploys/nginx_configs';

const upload = multer({
  dest: '/tmp/static_uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .zip'));
    }
  }
});

async function reloadNginx() {
  const container = docker.getContainer('static_server');
  const exec = await container.exec({
    Cmd: ['nginx', '-s', 'reload'],
    AttachStdout: true,
    AttachStderr: true,
  });
  await exec.start();
}

// POST /upload-static
// multipart/form-data: { site: string, zip: File }
// Accesible externamente en POST /api/upload-static
router.post('/upload-static', upload.single('zip'), async (req, res) => {
  const tmpFile = req.file?.path;
  try {
    const { site } = req.body;

    if (!site || !/^[a-z0-9-]+$/.test(site)) {
      return res.status(400).json({
        ok: false,
        error: 'Nombre de sitio inválido. Solo letras minúsculas, números y guiones.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo .zip' });
    }

    const siteDir  = path.join(STATIC_BASE, site);
    const confPath = path.join(NGINX_CONFIGS, `${site}.conf`);

    // Extraer zip
    await fs.emptyDir(siteDir);
    const zip = new AdmZip(tmpFile);
    zip.extractAllTo(siteDir, true);

    // Si el zip tenía una sola carpeta raíz (ej: dist/), subir su contenido un nivel
    const entries = await fs.readdir(siteDir);
    if (entries.length === 1) {
      const singleEntry = path.join(siteDir, entries[0]);
      const stat = await fs.stat(singleEntry);
      if (stat.isDirectory()) {
        const innerFiles = await fs.readdir(singleEntry);
        for (const f of innerFiles) {
          await fs.move(path.join(singleEntry, f), path.join(siteDir, f), { overwrite: true });
        }
        await fs.remove(singleEntry);
      }
    }

    // Validar que exista index.html
    const hasIndex = await fs.pathExists(path.join(siteDir, 'index.html'));
    if (!hasIndex) {
      await fs.emptyDir(siteDir);
      return res.status(400).json({
        ok: false,
        error: 'El zip no contiene un index.html en la raíz.'
      });
    }

    // Crear config nginx si no existe
    if (!await fs.pathExists(confPath)) {
      const nginxConf = `server {
    listen 80;
    server_name ${site}.stardest.com;
    root /srv/static/${site};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}`;
      await fs.writeFile(confPath, nginxConf);
    }

    await reloadNginx();
    await fs.remove(tmpFile);

    res.json({ ok: true, url: `https://${site}.stardest.com` });

  } catch (err) {
    if (tmpFile) await fs.remove(tmpFile).catch(() => {});
    console.error('[upload-static]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /static-sites/:site
// Accesible externamente en DELETE /api/static-sites/:site
router.delete('/static-sites/:site', async (req, res) => {
  try {
    const { site } = req.params;
    if (!/^[a-z0-9-]+$/.test(site)) {
      return res.status(400).json({ ok: false, error: 'Nombre de sitio inválido.' });
    }
    await fs.remove(path.join(STATIC_BASE, site));
    await fs.remove(path.join(NGINX_CONFIGS, `${site}.conf`));
    await reloadNginx();
    res.json({ ok: true });
  } catch (err) {
    console.error('[delete-static]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
```

---

## PASO 8 — Montar `upload-static.js` en el entrypoint del backend

**Ruta:** `deploy_panel/apps/builder/index.js`
**Acción:** agregar dos líneas al archivo existente. No reemplazar el archivo, solo añadir.

Buscar donde se montan las rutas de Express (donde hay otros `app.use(...)`) y añadir:

```javascript
const uploadStatic = require('./upload-static');
app.use(uploadStatic);
```

Si el archivo usa un router en lugar de `app` directamente, adaptar según el patrón ya usado en el proyecto.

---

## PASO 9 — Crear `StaticDeploy.jsx` en el frontend

**Ruta:** `deploy_panel/apps/web/src/StaticDeploy.jsx`
**Acción:** crear archivo nuevo.

Antes de crear el archivo, instalar la dependencia en `deploy_panel/apps/web/`:
```bash
npm install jszip
```

Componente React completo con:
- Input de nombre de sitio (solo `[a-z0-9-]`, se sanitiza en tiempo real)
- Zona de drag & drop que acepta carpeta o `.zip`
- Si el usuario arrastra una carpeta: la empaqueta en zip en el cliente con JSZip antes de subir
- Si arrastra un `.zip` directamente: lo sube sin reempaquetar
- Barra de progreso con XHR
- Estados: `idle` → `uploading` → `done` | `error`
- Al terminar muestra la URL del sitio desplegado

```jsx
// StaticDeploy.jsx
import { useState, useRef } from 'react';
import JSZip from 'jszip';

export default function StaticDeploy() {
  const [siteName, setSiteName]     = useState('');
  const [status, setStatus]         = useState('idle');
  const [progress, setProgress]     = useState(0);
  const [resultUrl, setResultUrl]   = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function addEntryToZip(zip, entry, basePath = '') {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file((file) => { zip.file(basePath + file.name, file); resolve(); }, reject);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries) => {
          for (const child of entries) await addEntryToZip(zip, child, basePath + entry.name + '/');
          resolve();
        }, reject);
      }
    });
  }

  async function buildZipFromItems(items) {
    const zip = new JSZip();
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;
      if (entry.isDirectory) {
        const reader = entry.createReader();
        await new Promise((resolve, reject) => {
          reader.readEntries(async (entries) => {
            for (const child of entries) await addEntryToZip(zip, child, '');
            resolve();
          }, reject);
        });
      } else {
        await addEntryToZip(zip, entry, '');
      }
    }
    return zip.generateAsync({ type: 'blob' });
  }

  function uploadZip(zipBlob) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('site', siteName);
      formData.append('zip', zipBlob, `${siteName}.zip`);
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(30 + Math.round((e.loaded / e.total) * 60));
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) { setProgress(100); setStatus('done'); setResultUrl(data.url); resolve(); }
          else { setStatus('error'); setErrorMsg(data.error || 'Error desconocido'); reject(new Error(data.error)); }
        } else {
          setStatus('error'); setErrorMsg(`Error del servidor: ${xhr.status}`); reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => { setStatus('error'); setErrorMsg('Error de red.'); reject(new Error('Network error')); };
      xhr.open('POST', '/api/upload-static');
      xhr.send(formData);
    });
  }

  async function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (!siteName || !/^[a-z0-9-]+$/.test(siteName)) {
      setErrorMsg('Escribe un nombre de sitio válido antes de subir.');
      return;
    }
    setStatus('uploading'); setProgress(0); setErrorMsg('');
    try {
      const items = Array.from(e.dataTransfer.items);
      const files = Array.from(e.dataTransfer.files);
      let zipBlob;
      if (files.length === 1 && files[0].name.endsWith('.zip')) {
        zipBlob = files[0]; setProgress(30);
      } else {
        setProgress(10); zipBlob = await buildZipFromItems(items); setProgress(30);
      }
      await uploadZip(zipBlob);
    } catch (err) { setStatus('error'); setErrorMsg(err.message); }
  }

  async function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!siteName || !/^[a-z0-9-]+$/.test(siteName)) { setErrorMsg('Escribe un nombre de sitio válido primero.'); return; }
    setStatus('uploading'); setProgress(30); setErrorMsg('');
    try { await uploadZip(file); }
    catch (err) { setStatus('error'); setErrorMsg(err.message); }
  }

  function reset() {
    setStatus('idle'); setProgress(0); setResultUrl(''); setErrorMsg(''); setSiteName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: 'sans-serif', padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Deploy estático</h2>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Nombre del sitio</span>
        <input
          type="text"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="mi-sitio"
          disabled={status === 'uploading'}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
        />
      </label>
      {siteName && (
        <p style={{ margin: '-8px 0 16px', fontSize: 13, color: '#6b7280' }}>
          URL resultante: <strong style={{ color: '#111' }}>{siteName}.stardest.com</strong>
        </p>
      )}

      {status === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${isDragging ? '#4f46e5' : '#d1d5db'}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: isDragging ? '#eef2ff' : '#f9fafb', transition: 'all 0.15s', userSelect: 'none' }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Arrastra tu carpeta o <code>.zip</code> aquí</p>
          <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>o haz clic para seleccionar un archivo</p>
          <input ref={inputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {status === 'uploading' && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>Subiendo... {progress}%</p>
          <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{ background: '#4f46e5', width: `${progress}%`, height: '100%', borderRadius: 99, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ marginTop: 8, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>✅ Deploy completado</p>
          <a href={resultUrl} target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>{resultUrl}</a>
          <br />
          <button onClick={reset} style={{ marginTop: 12, padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Nuevo deploy
          </button>
        </div>
      )}

      {(status === 'error' || errorMsg) && (
        <div style={{ marginTop: 8, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>❌ {errorMsg}</p>
          <button onClick={reset} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## PASO 10 — Levantar los nuevos servicios

Ejecutar en el servidor:

```bash
cd /home/project/deploys

# Levantar static_server y rebuild deploy_panel (por los nuevos volúmenes)
docker compose up -d --build deploy_panel static_server

# Reiniciar webhook para que recargue hooks.json
# (el comando exacto depende de cómo esté corriendo en el host, ejemplos:)
pkill webhook && nohup webhook -hooks hooks.json -verbose &
# o si usa systemd:
systemctl restart webhook
```

---

## Resumen de archivos por acción

| Acción | Archivo | Ruta en el servidor |
|--------|---------|---------------------|
| Reemplazar | `docker-compose.yml` | `/home/project/deploys/` |
| Reemplazar | `hooks.json` | `/home/project/deploys/` |
| Crear nuevo | `deploy_static.sh` | `/home/project/deploys/` |
| Crear nuevo | `static_projects.json` | `/home/project/deploys/` |
| Crear nuevo | `nginx_configs/default.conf` | `/home/project/deploys/nginx_configs/` |
| Crear nuevo | `upload-static.js` | `deploy_panel/apps/builder/` |
| Modificar | `index.js` | `deploy_panel/apps/builder/` |
| Crear nuevo | `StaticDeploy.jsx` | `deploy_panel/apps/web/src/` |

## Dependencias npm a instalar

```bash
# En deploy_panel/ (backend)
npm install multer adm-zip fs-extra dockerode

# En deploy_panel/apps/web/ (frontend)
npm install jszip
```

---

## Flujo completo resultante

```
── Git-based deploy ──────────────────────────────────────────
GitHub push
  → POST /hooks/deploy-static { "site": "mi-proyecto" }
  → webhook (host:9000) → deploy_static.sh "mi-proyecto"
  → lee static_projects.json
  → git clone/pull
  → docker run node:20-alpine (npm install + build)
  → rsync output → static_sites/mi-proyecto/
  → genera nginx_configs/mi-proyecto.conf (solo primera vez)
  → docker exec static_server nginx -s reload
  → https://mi-proyecto.stardest.com ✅

── Drag & drop deploy ────────────────────────────────────────
Usuario arrastra carpeta o .zip al panel
  → JSZip empaqueta en cliente (si es carpeta)
  → POST /api/upload-static { site, zip }
  → deploy_panel extrae zip → static_sites/mi-proyecto/
  → genera nginx_configs/mi-proyecto.conf (solo primera vez)
  → dockerode → nginx -s reload en static_server
  → https://mi-proyecto.stardest.com ✅
```
