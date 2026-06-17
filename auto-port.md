# Instrucciones: Detección automática de puerto

## Contexto

Actualmente `deployApp` hardcodea el puerto `3000` en el label de Traefik:

```javascript
[`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000"
```

Esto falla cuando el repo corre en un puerto diferente (ej: PHP en 8080, apps con `PORT=4000`, etc).

---

## TAREA — Agregar función `detectPort` en `index.js`

Agregar esta función en `deploy_panel/apps/builder/index.js` antes de `deployApp`:

```javascript
function detectPort(repoPath) {
    // 1. Buscar en Dockerfile
    const dockerfilePath = path.join(repoPath, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
        const content = fs.readFileSync(dockerfilePath, 'utf8');
        // EXPOSE 8080 o EXPOSE 3000
        const exposeMatch = content.match(/^EXPOSE\s+(\d+)/m);
        if (exposeMatch) {
            console.log(`[Port] Detectado en Dockerfile EXPOSE: ${exposeMatch[1]}`);
            return exposeMatch[1];
        }
        // ENV PORT=8080
        const envPortMatch = content.match(/ENV\s+PORT[=\s]+(\d+)/);
        if (envPortMatch) {
            console.log(`[Port] Detectado en Dockerfile ENV PORT: ${envPortMatch[1]}`);
            return envPortMatch[1];
        }
    }

    // 2. Buscar en .env.example o .env.sample
    const envFiles = ['.env.example', '.env.sample', '.env.defaults'];
    for (const envFile of envFiles) {
        const envPath = path.join(repoPath, envFile);
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(/^PORT\s*=\s*(\d+)/m);
            if (match) {
                console.log(`[Port] Detectado en ${envFile}: ${match[1]}`);
                return match[1];
            }
        }
    }

    // 3. Buscar en package.json scripts
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const startScript = pkg.scripts?.start || '';
            // --port 4000 o -p 4000
            const portMatch = startScript.match(/--port[=\s]+(\d+)|-p\s+(\d+)/);
            if (portMatch) {
                const port = portMatch[1] || portMatch[2];
                console.log(`[Port] Detectado en package.json scripts.start: ${port}`);
                return port;
            }
        } catch (e) {}
    }

    // 4. Buscar en archivos de config de nginx dentro del repo
    const nginxFiles = [
        'nginx.conf',
        'docker/nginx.conf',
        'config/nginx.conf',
    ];
    for (const nginxFile of nginxFiles) {
        const nginxPath = path.join(repoPath, nginxFile);
        if (fs.existsSync(nginxPath)) {
            const content = fs.readFileSync(nginxPath, 'utf8');
            // listen 8080;
            const listenMatch = content.match(/listen\s+(\d+)/);
            if (listenMatch && listenMatch[1] !== '80' && listenMatch[1] !== '443') {
                console.log(`[Port] Detectado en ${nginxFile}: ${listenMatch[1]}`);
                return listenMatch[1];
            }
        }
    }

    // 5. Buscar en docker-compose.yml del repo
    const composePath = path.join(repoPath, 'docker-compose.yml');
    if (fs.existsSync(composePath)) {
        const content = fs.readFileSync(composePath, 'utf8');
        // ports: - "8080:8080" o - "3000:3000"
        const portsMatch = content.match(/["']?(\d+):(\d+)["']?/);
        if (portsMatch) {
            console.log(`[Port] Detectado en docker-compose.yml: ${portsMatch[2]}`);
            return portsMatch[2]; // puerto interno del contenedor
        }
    }

    // 6. Defaults por tipo de proyecto
    return null; // usar default del llamador
}
```

---

## TAREA — Integrar `detectPort` en `deployApp`

En la función `deployApp`, después de detectar el tipo de proyecto (`isNextJs`, `isVite`, etc.) y antes del bloque de build, agregar:

```javascript
// Detectar puerto del repo
let appPort = detectPort(repoPath);

// Si no se detectó, usar defaults por tipo de proyecto
if (!appPort) {
    if (isNextJs)  appPort = '3000';
    else if (isVite)    appPort = '3000';
    else if (isPython)  appPort = '3000';
    else if (isNode)    appPort = '3000';
    else if (isStatic)  appPort = '3000';
    else appPort = '3000';
}

console.log(`[Port] Puerto final para ${subdomain}: ${appPort}`);
```

---

## TAREA — Usar `appPort` en el label de Traefik

En `docker.createContainer`, reemplazar el puerto hardcodeado:

```javascript
// ANTES:
[`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000",

// DESPUÉS:
[`traefik.http.services.${subdomain}.loadbalancer.server.port`]: appPort,
```

También guardar el puerto en un label para referencia:
```javascript
"deploy.port": appPort,
```

---

## TAREA — Usar `appPort` en los Dockerfiles generados

Cuando el sistema genera un Dockerfile (para Vite, Node, Python, Static), también debe usar `appPort` en el `EXPOSE` si el puerto detectado no es 3000.

### Para Vite:
```javascript
const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install react-is --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
RUN echo 'server { listen ${appPort}; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE ${appPort}
`;
```

### Para Node:
```javascript
const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE ${appPort}
ENV PORT=${appPort}
CMD ["npm", "start"]
`;
```

### Para Python:
```javascript
const dockerfile = `FROM python:3.11-slim
WORKDIR /app
${aptGetCommand}COPY ${reqRelativePath} ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${appPort}
CMD ["uvicorn", "${uvicornModule}", "--host", "0.0.0.0", "--port", "${appPort}"]
`;
```

### Para Static (nginx):
```javascript
const dockerfile = `FROM nginx:alpine
RUN printf 'server {\\nlisten ${appPort};\\nroot /usr/share/nginx/html;\\nindex index.html;\\nlocation / {\\ntry_files $uri $uri/ /index.html;\\n}\\n}\\n' > /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE ${appPort}
`;
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar función `detectPort` antes de `deployApp` |
| `deploy_panel/apps/builder/index.js` | En `deployApp`: llamar `detectPort` y asignar `appPort` |
| `deploy_panel/apps/builder/index.js` | En `docker.createContainer`: usar `appPort` en el label de Traefik |
| `deploy_panel/apps/builder/index.js` | En los Dockerfiles generados (Vite, Node, Python, Static): usar `appPort` en `EXPOSE` y `ENV PORT` |

## Orden de prioridad de detección

```
1. Dockerfile EXPOSE        ← más confiable
2. Dockerfile ENV PORT
3. .env.example PORT=
4. package.json scripts.start --port
5. nginx.conf listen
6. docker-compose.yml ports
7. Default por tipo (3000)  ← fallback
```

## Ejemplos de repos y puertos detectados

| Repo | Archivo detectado | Puerto |
|------|-------------------|--------|
| PHP con nginx en 8080 | `Dockerfile` EXPOSE 8080 | 8080 |
| Express con PORT=4000 | `.env.example` PORT=4000 | 4000 |
| Next.js estándar | ninguno | 3000 (default) |
| FastAPI en 8000 | `Dockerfile` EXPOSE 8000 | 8000 |
| Vite build | ninguno | 3000 (default) |
