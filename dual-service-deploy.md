# Instrucciones: Soporte para frontend + backend en un mismo subdominio

## Contexto

Algunos repos monorepo tienen **dos servicios de aplicación** en su `docker-compose.yml` (no solo uno): un `backend` (API) y un `frontend` (UI). El sistema actual (`monorepo-compose.md`) solo detecta y construye **el primer servicio con `build`** que encuentra, ignorando el resto.

Hay que extender `findAppService` para detectar **todos** los servicios de app, clasificarlos como frontend/backend, construir ambas imágenes, y enrutarlos bajo el mismo subdominio así:

```
mi-app.stardest.com/api/*   → backend
mi-app.stardest.com/*       → frontend (catch-all)
```

Este documento es un **complemento** a `monorepo-compose.md` — reutiliza `parseDockerCompose`, `isInfraService`, `resolveAppServicePort`, `mapAppEnvToDbCredentials` y `ensureDockerfileCopiesSource` ya implementadas.

---

## PASO 1 — Reemplazar `findAppService` por `findAppServices` (plural)

En `deploy_panel/apps/builder/index.js`, reemplazar la función `findAppService` por esta versión que detecta **todos** los servicios de app, no solo el primero:

```javascript
function findAppServices(compose) {
    if (!compose || !compose.services) return [];

    const services = compose.services;
    const appServices = [];

    for (const name of Object.keys(services)) {
        const svc = services[name];
        if (svc.build && !isInfraService(name, svc)) {
            appServices.push({ name, config: svc });
        }
    }

    return appServices;
}
```

---

## PASO 2 — Agregar función `classifyService`

Determina si un servicio es `frontend` o `backend` según su nombre y la imagen base de su Dockerfile.

```javascript
function classifyService(serviceName, serviceConfig, dockerfileContent) {
    const name = serviceName.toLowerCase();

    // 1. Por nombre del servicio
    if (/front|client|web|ui|app$/i.test(name)) return 'frontend';
    if (/back|api|server/i.test(name)) return 'backend';

    // 2. Por imagen base del Dockerfile, si se pudo leer
    if (dockerfileContent) {
        const content = dockerfileContent.toLowerCase();
        if (/from\s+(node|nginx)/.test(content) && /(vite|react|vue|npm run build|next)/.test(content)) {
            return 'frontend';
        }
        if (/from\s+(php|python|.*-slim)/.test(content)) {
            return 'backend';
        }
    }

    return 'unknown';
}
```

---

## PASO 3 — Agregar función `resolveMultiServiceDeploy`

Esta función decide si el repo necesita el flujo de **un solo servicio** (ya documentado en `monorepo-compose.md`) o el flujo de **frontend + backend**.

```javascript
function resolveMultiServiceDeploy(repoPath, compose) {
    const appServices = findAppServices(compose);

    if (appServices.length === 0) return null;

    if (appServices.length === 1) {
        // Comportamiento ya existente de monorepo-compose.md (un solo servicio)
        return { mode: 'single', services: appServices };
    }

    // Clasificar cada servicio
    const classified = appServices.map(svc => {
        const buildConfig = svc.config.build;
        const buildContext = typeof buildConfig === 'string' ? buildConfig : (buildConfig.context || '.');
        const dockerfileRelative = typeof buildConfig === 'object' ? (buildConfig.dockerfile || 'Dockerfile') : 'Dockerfile';
        const absoluteContext = path.join(repoPath, buildContext);
        const absoluteDockerfile = path.join(absoluteContext, dockerfileRelative);

        let dockerfileContent = null;
        if (fs.existsSync(absoluteDockerfile)) {
            dockerfileContent = fs.readFileSync(absoluteDockerfile, 'utf8');
        }

        return {
            ...svc,
            role: classifyService(svc.name, svc.config, dockerfileContent),
            buildContext: absoluteContext,
            dockerfilePath: absoluteDockerfile,
            port: resolveAppServicePort(svc.config),
        };
    });

    const backend = classified.find(s => s.role === 'backend');
    const frontend = classified.find(s => s.role === 'frontend');

    if (backend && frontend) {
        console.log(`[Compose] Doble servicio detectado: backend="${backend.name}", frontend="${frontend.name}"`);
        return { mode: 'dual', backend, frontend };
    }

    // No se pudo clasificar claramente — usar el primero como single (fallback seguro)
    console.warn('[Compose] Múltiples servicios detectados pero no se pudo clasificar frontend/backend. Usando el primero.');
    return { mode: 'single', services: [appServices[0]] };
}
```

---

## PASO 4 — Modificar `deployApp` para manejar el modo `dual`

En `deployApp`, donde antes se llamaba a `findAppService` (de `monorepo-compose.md`), reemplazar por:

```javascript
const compose = parseDockerCompose(repoPath);
let deployPlan = null;

if (compose) {
    deployPlan = resolveMultiServiceDeploy(repoPath, compose);
}
```

Y agregar un nuevo bloque **antes** de la cadena de detección existente (`if (hasDockerfile || monorepoApp)`), que maneja específicamente el modo `dual`:

```javascript
if (deployPlan && deployPlan.mode === 'dual') {
    return await deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath);
}

// Si es modo 'single', adaptar a la variable monorepoApp existente para no romper monorepo-compose.md
let monorepoApp = null;
if (deployPlan && deployPlan.mode === 'single' && deployPlan.services[0]) {
    const svc = deployPlan.services[0];
    const buildConfig = svc.config.build;
    const buildContext = typeof buildConfig === 'string' ? buildConfig : (buildConfig.context || '.');
    const dockerfileRelative = typeof buildConfig === 'object' ? (buildConfig.dockerfile || 'Dockerfile') : 'Dockerfile';
    const absoluteContext = path.join(repoPath, buildContext);
    const absoluteDockerfile = path.join(absoluteContext, dockerfileRelative);

    if (fs.existsSync(absoluteDockerfile)) {
        monorepoApp = {
            serviceName: svc.name,
            buildContext: absoluteContext,
            dockerfilePath: absoluteDockerfile,
            port: resolveAppServicePort(svc.config),
            serviceConfig: svc.config,
        };
    }
}

// ... continúa la cadena existente: if (hasDockerfile || monorepoApp) { ... } else if (isNextJs) { ... }
```

---

## PASO 5 — Agregar función `deployDualService`

Esta es la función nueva que construye **dos** imágenes, lanza **dos** contenedores, y los enruta bajo el mismo subdominio con prioridad de path.

```javascript
async function deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath) {
    const { backend, frontend } = deployPlan;
    const backendImageName = `user-app-${subdomain.toLowerCase()}-backend`;
    const frontendImageName = `user-app-${subdomain.toLowerCase()}-frontend`;

    console.log(`[Dual] Iniciando deploy dual para ${subdomain}`);

    // 1. Provisionar DB si aplica (solo se conecta al backend)
    let dbCredentials = null;
    if (dbType) {
        dbCredentials = await provisionDatabase(subdomain, dbType, repoPath);
    }

    // 2. Parchar y construir imagen del BACKEND
    ensureDockerfileCopiesSource(backend.dockerfilePath);
    console.log(`[Dual] Construyendo backend desde ${backend.buildContext}...`);
    let stream = await docker.buildImage(
        { context: backend.buildContext, src: ['.'] },
        { t: backendImageName, dockerfile: path.basename(backend.dockerfilePath) }
    );
    await runDockerBuild(stream);

    // 3. Parchar y construir imagen del FRONTEND
    ensureDockerfileCopiesSource(frontend.dockerfilePath);
    console.log(`[Dual] Construyendo frontend desde ${frontend.buildContext}...`);
    stream = await docker.buildImage(
        { context: frontend.buildContext, src: ['.'] },
        { t: frontendImageName, dockerfile: path.basename(frontend.dockerfilePath) }
    );
    await runDockerBuild(stream);

    // 4. Limpiar contenedores anteriores (backend, frontend, y el legacy single si existía)
    const containers = await docker.listContainers({ all: true });
    for (const suffix of ['-backend', '-frontend', '']) {
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}${suffix}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }
    }

    // 5. Variables de entorno del backend (incluye mapeo de DB si aplica)
    let backendEnv = [];
    if (dbCredentials) {
        backendEnv = dbCredentials.dbType === 'mysql' ? [
            `MYSQLHOST=${dbCredentials.dbHost}`,
            `MYSQLPORT=${dbCredentials.dbPort}`,
            `MYSQLDATABASE=${dbCredentials.dbName}`,
            `MYSQLUSER=${dbCredentials.dbUser}`,
            `MYSQLPASSWORD=${dbCredentials.dbPassword}`,
            `DATABASE_URL=mysql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ] : [
            `PGHOST=${dbCredentials.dbHost}`,
            `PGPORT=${dbCredentials.dbPort}`,
            `PGDATABASE=${dbCredentials.dbName}`,
            `PGUSER=${dbCredentials.dbUser}`,
            `PGPASSWORD=${dbCredentials.dbPassword}`,
            `DATABASE_URL=postgresql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ];

        const dbServiceName = Object.keys(deployPlan.backend.config).length
            ? Object.keys((await parseDockerCompose(repoPath)).services).find(name =>
                isInfraService(name, (parseDockerCompose(repoPath)).services[name])
              )
            : null;
        const mappedEnv = mapAppEnvToDbCredentials(backend.config, dbServiceName, dbCredentials);
        backendEnv = [...backendEnv, ...mappedEnv];
    }

    // 6. Lanzar contenedor BACKEND con PathPrefix /api
    const backendPort = backend.port || '80';
    const backendContainer = await docker.createContainer({
        Image: backendImageName,
        name: `container-${subdomain}-backend`,
        Env: backendEnv,
        Labels: {
            "traefik.enable": "true",
            [`traefik.http.routers.${subdomain}-backend.rule`]: `Host(\`${subdomain}.stardest.com\`) && PathPrefix(\`/api\`)`,
            [`traefik.http.routers.${subdomain}-backend.entrypoints`]: "web",
            [`traefik.http.routers.${subdomain}-backend.priority`]: "10",
            [`traefik.http.services.${subdomain}-backend.loadbalancer.server.port`]: backendPort,
            "deploy.subdomain": subdomain,
            "deploy.role": "backend",
            "deploy.branch": branch || "main",
            "deploy.repo": repoUrl,
            "deploy.timestamp": new Date().toISOString(),
            "deploy.userId": userId || 'anonymous',
            "deploy.userEmail": userEmail || 'anonymous',
            ...(dbCredentials ? {
                "deploy.db.type":       dbCredentials.dbType,
                "deploy.db.host":       dbCredentials.dbHost,
                "deploy.db.port":       dbCredentials.dbPort,
                "deploy.db.name":       dbCredentials.dbName,
                "deploy.db.user":       dbCredentials.dbUser,
                "deploy.db.password":   dbCredentials.dbPassword,
                "deploy.db.adminerUrl": dbCredentials.adminerUrl || '',
            } : {}),
        },
        HostConfig: {
            NetworkMode: "deploys_internal_network",
            RestartPolicy: { Name: "always" },
            Privileged: true,
        }
    });
    await backendContainer.start();
    console.log(`[Dual] ✓ Backend desplegado en ${subdomain}.stardest.com/api`);

    // 7. Lanzar contenedor FRONTEND como catch-all
    const frontendPort = frontend.port || '80';
    const frontendContainer = await docker.createContainer({
        Image: frontendImageName,
        name: `container-${subdomain}-frontend`,
        Labels: {
            "traefik.enable": "true",
            [`traefik.http.routers.${subdomain}-frontend.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
            [`traefik.http.routers.${subdomain}-frontend.entrypoints`]: "web",
            [`traefik.http.routers.${subdomain}-frontend.priority`]: "1",
            [`traefik.http.services.${subdomain}-frontend.loadbalancer.server.port`]: frontendPort,
            "deploy.subdomain": subdomain,
            "deploy.role": "frontend",
            "deploy.branch": branch || "main",
            "deploy.repo": repoUrl,
            "deploy.timestamp": new Date().toISOString(),
            "deploy.userId": userId || 'anonymous',
            "deploy.userEmail": userEmail || 'anonymous',
        },
        HostConfig: {
            NetworkMode: "deploys_internal_network",
            RestartPolicy: { Name: "always" },
        }
    });
    await frontendContainer.start();
    console.log(`[Dual] ✓ Frontend desplegado en ${subdomain}.stardest.com`);

    return `https://${subdomain}.stardest.com`;
}
```

---

## PASO 6 — Actualizar `DELETE /deploy/:subdomain` para borrar ambos contenedores

```javascript
app.delete('/deploy/:subdomain', async (req, res) => {
    const { subdomain } = req.params;
    if (!subdomain) return res.status(400).json({ status: 'error', message: "Falta el subdominio" });
    try {
        const containers = await docker.listContainers({ all: true });
        const possibleNames = [
            `/container-${subdomain}`,
            `/container-${subdomain}-backend`,
            `/container-${subdomain}-frontend`,
            `/db-${subdomain}`,
            `/adminer-${subdomain}`,
        ];

        let removedAny = false;
        for (const name of possibleNames) {
            const existing = containers.find(c => c.Names.includes(name));
            if (existing) {
                await docker.getContainer(existing.Id).remove({ force: true });
                console.log(`Contenedor ${name} eliminado.`);
                removedAny = true;
            }
        }

        if (removedAny) {
            res.json({ status: 'success', message: `Proyecto ${subdomain} eliminado correctamente.` });
        } else {
            res.status(404).json({ status: 'warning', message: `No se encontró el proyecto.` });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});
```

---

## PASO 7 — Actualizar `GET /deploys` para agrupar por subdominio (opcional, recomendado)

Sin este paso, el dashboard mostraría dos filas separadas (`-backend` y `-frontend`) para el mismo subdominio. Para mostrar una sola fila:

```javascript
app.get('/deploys', async (req, res) => {
    try {
        let filterUserId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
                filterUserId = decoded.id || null;
            } catch (e) {}
        }

        const containers = await docker.listContainers({ all: true });
        const appContainers = containers.filter(c => c.Names.some(n => n.includes('container-')));

        // Agrupar por subdominio (usando el label deploy.subdomain si existe, o el nombre)
        const grouped = {};
        for (const c of appContainers) {
            const labels = c.Labels;
            const subdomain = labels['deploy.subdomain'] || c.Names[0].replace('/container-', '').replace(/-backend$|-frontend$/, '');

            if (filterUserId && labels['deploy.userId'] !== filterUserId) continue;

            if (!grouped[subdomain]) {
                grouped[subdomain] = {
                    subdomain,
                    status: c.State,
                    branch: labels['deploy.branch'] || 'unknown',
                    repo: labels['deploy.repo'] || 'unknown',
                    deployedAt: labels['deploy.timestamp'] || 'unknown',
                    userId: labels['deploy.userId'] || 'unknown',
                    userEmail: labels['deploy.userEmail'] || 'unknown',
                    roles: [],
                    database: labels['deploy.db.type'] ? {
                        type: labels['deploy.db.type'],
                        host: labels['deploy.db.host'],
                        port: labels['deploy.db.port'],
                        name: labels['deploy.db.name'],
                        user: labels['deploy.db.user'],
                        password: labels['deploy.db.password'],
                        adminerUrl: labels['deploy.db.adminerUrl'] || null,
                    } : null,
                };
            }

            grouped[subdomain].roles.push(labels['deploy.role'] || 'app');
            // Si cualquiera de los componentes no está 'running', reflejarlo
            if (c.State !== 'running') grouped[subdomain].status = c.State;
        }

        res.json({ status: 'success', deploys: Object.values(grouped) });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});
```

El campo nuevo `roles` (ej. `['backend', 'frontend']` o `['app']`) puede mostrarse en el Dashboard como badge informativo, opcional.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Reemplazar `findAppService` por `findAppServices` (detecta todos) |
| `deploy_panel/apps/builder/index.js` | Agregar `classifyService` |
| `deploy_panel/apps/builder/index.js` | Agregar `resolveMultiServiceDeploy` |
| `deploy_panel/apps/builder/index.js` | Agregar `deployDualService` |
| `deploy_panel/apps/builder/index.js` | En `deployApp`: detectar modo `dual` y delegar a `deployDualService` |
| `deploy_panel/apps/builder/index.js` | `DELETE /deploy/:subdomain` borra `-backend`, `-frontend`, `db-`, `adminer-` |
| `deploy_panel/apps/builder/index.js` | `GET /deploys` agrupa por subdominio (opcional pero recomendado) |

---

## Resultado esperado con el repo de ejemplo

```
docker-compose.yml
├── db        → mysql:8.0        (ignorado, StarDest provisiona su propia DB)
├── backend   → build: ./backend  → clasificado como "backend"
└── frontend  → build: ./frontend → clasificado como "frontend"
```

```
GET  https://mney.stardest.com/          → responde el frontend (Vite/React build)
POST https://mney.stardest.com/api/login → responde el backend (PHP)
```

Ambos sirviendo bajo el mismo subdominio, sin que el usuario configure nada de enrutamiento manualmente.

## Notas

- Si el repo solo tiene un servicio con `build` (caso normal ya cubierto por `monorepo-compose.md`), el comportamiento no cambia
- Si hay 2+ servicios pero no se pueden clasificar claramente como frontend/backend, el sistema cae de vuelta al modo `single` usando el primero — nunca falla silenciosamente, siempre loguea una advertencia
- El frontend normalmente debe estar **ya compilado** dentro de su Dockerfile (ej. `RUN npm run build` + servir con nginx) para que funcione como sitio estático — si el Dockerfile del frontend solo levanta un dev server de Vite, funcionará pero no es lo ideal para producción (esto depende del repo del usuario, no de StarDest)
