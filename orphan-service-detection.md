# Instrucciones: Detectar servicios "huérfanos" no listados en docker-compose.yml

## Contexto

Algunos repos tienen una carpeta como `frontend/` con su propio `Dockerfile`, pero el `docker-compose.yml` de la raíz **nunca la referencia** como servicio — solo define `db`, `backend` y `phpmyadmin`, por ejemplo. El sistema actual (`monorepo-compose.md` + `dual-service-deploy.md`) solo encuentra servicios definidos explícitamente en el `docker-compose.yml`, así que nunca detecta el modo `dual` en este caso.

Esta extensión hace que StarDest **escanee las carpetas de primer nivel del repo** buscando Dockerfiles que no están referenciados en el compose, y si encuentra exactamente una carpeta "huérfana" que se pueda clasificar como el rol opuesto al servicio ya detectado (ej. compose tiene `backend`, la carpeta huérfana es `frontend/`), las despliega juntas en modo dual automáticamente.

---

## PASO 1 — Agregar función `findOrphanServiceDirs`

En `deploy_panel/apps/builder/index.js`, agregar antes de `resolveMultiServiceDeploy`:

```javascript
const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.github', 'database', 'db', 'sql',
    'migrations', 'docs', 'scripts', '.vscode', '.idea', 'dist', 'build',
]);

function getComposeBuildContexts(compose) {
    const contexts = new Set();
    if (!compose || !compose.services) return contexts;

    for (const name of Object.keys(compose.services)) {
        const svc = compose.services[name];
        if (svc.build) {
            const ctx = typeof svc.build === 'string' ? svc.build : (svc.build.context || '.');
            contexts.add(path.normalize(ctx).replace(/^\.\//, ''));
        }
    }
    return contexts;
}

function findOrphanServiceDirs(repoPath, compose) {
    const usedContexts = getComposeBuildContexts(compose);
    const orphans = [];

    let entries;
    try {
        entries = fs.readdirSync(repoPath, { withFileTypes: true });
    } catch (e) {
        return orphans;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name;

        if (IGNORED_DIRS.has(dirName.toLowerCase())) continue;
        if (usedContexts.has(dirName)) continue; // ya está en el compose

        const dockerfilePath = path.join(repoPath, dirName, 'Dockerfile');
        if (fs.existsSync(dockerfilePath)) {
            orphans.push({ dirName, dockerfilePath });
            console.log(`[Compose] Carpeta huérfana con Dockerfile encontrada: ${dirName}/`);
        }
    }

    return orphans;
}
```

---

## PASO 2 — Agregar función `detectPortFromDockerfile`

Las carpetas huérfanas no tienen información de puertos en el compose (porque no están listadas ahí), así que hay que leer el `EXPOSE` directamente de su Dockerfile.

```javascript
function detectPortFromDockerfile(dockerfilePath) {
    if (!fs.existsSync(dockerfilePath)) return null;
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    const match = content.match(/^EXPOSE\s+(\d+)/m);
    return match ? match[1] : null;
}
```

---

## PASO 3 — Modificar `resolveMultiServiceDeploy` para incluir huérfanos

Reemplazar la función completa por esta versión extendida:

```javascript
function resolveMultiServiceDeploy(repoPath, compose) {
    const appServices = findAppServices(compose);

    // Clasificar los servicios que sí están en el compose
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
            name: svc.name,
            config: svc.config,
            role: classifyService(svc.name, svc.config, dockerfileContent),
            buildContext: absoluteContext,
            dockerfilePath: absoluteDockerfile,
            port: resolveAppServicePort(svc.config),
            fromCompose: true,
        };
    });

    // Buscar carpetas huérfanas con Dockerfile que no estén en el compose
    const orphanDirs = findOrphanServiceDirs(repoPath, compose);
    for (const orphan of orphanDirs) {
        const dockerfileContent = fs.readFileSync(orphan.dockerfilePath, 'utf8');
        const role = classifyService(orphan.dirName, {}, dockerfileContent);

        classified.push({
            name: orphan.dirName,
            config: {}, // no tiene environment/ports definidos en compose
            role,
            buildContext: path.join(repoPath, orphan.dirName),
            dockerfilePath: orphan.dockerfilePath,
            port: detectPortFromDockerfile(orphan.dockerfilePath),
            fromCompose: false,
        });
    }

    if (classified.length === 0) return null;

    if (classified.length === 1) {
        return { mode: 'single', services: [classified[0]] };
    }

    const backend = classified.find(s => s.role === 'backend');
    const frontend = classified.find(s => s.role === 'frontend');

    if (backend && frontend) {
        console.log(`[Compose] Doble servicio detectado: backend="${backend.name}" (${backend.fromCompose ? 'compose' : 'huérfano'}), frontend="${frontend.name}" (${frontend.fromCompose ? 'compose' : 'huérfano'})`);
        return { mode: 'dual', backend, frontend };
    }

    console.warn('[Compose] Múltiples servicios detectados pero no se pudo clasificar frontend/backend claramente. Usando el primero del compose.');
    const fallback = classified.find(s => s.fromCompose) || classified[0];
    return { mode: 'single', services: [fallback] };
}
```

---

## PASO 4 — Ajustar `deployDualService` para servicios sin `config` de compose

Como los servicios huérfanos no tienen `config.environment` ni `config.ports` (porque nunca estuvieron en el compose), `deployDualService` (de `dual-service-deploy.md`) ya maneja esto correctamente porque:
- `backend.port` / `frontend.port` ahora puede venir de `detectPortFromDockerfile` (huérfano) o `resolveAppServicePort` (compose) — ambos casos cubiertos
- `mapAppEnvToDbCredentials(backend.config, ...)` simplemente no encontrará nada que mapear si `backend.config` está vacío (`{}`), lo cual es seguro — no lanza error, solo no agrega variables extra

No se requiere ningún cambio adicional en `deployDualService`, solo asegurarse de que use `backend.port` y `frontend.port` (ya lo hace según `dual-service-deploy.md`).

---

## PASO 5 — Ajustar la llamada en `deployApp`

Donde se llama `resolveMultiServiceDeploy`, el `compose` puede ser `null` si el repo no tiene `docker-compose.yml` en absoluto, pero el repo sí puede tener carpetas huérfanas igual (ej. un repo sin compose pero con `backend/Dockerfile` y `frontend/Dockerfile`). Ajustar para que la búsqueda de huérfanos funcione también sin compose:

```javascript
const compose = parseDockerCompose(repoPath); // puede ser null
let deployPlan = resolveMultiServiceDeploy(repoPath, compose); // ya maneja compose === null internamente porque findAppServices(null) retorna []
```

Verificar que `findAppServices(compose)` maneje `compose === null` sin lanzar error (ya lo hace: `if (!compose || !compose.services) return [];`), y que `getComposeBuildContexts(compose)` también maneje `compose === null` (ya lo hace con el mismo guard).

---

## Resultado esperado con el repo de ejemplo (finanzas)

```
docker-compose.yml define: db, backend, phpmyadmin   (frontend NO está aquí)
Carpetas en la raíz: backend/, frontend/, (db ignorado por IGNORED_DIRS si se llama 'database')
```

Flujo:
1. `findAppServices(compose)` → encuentra solo `backend` (tiene `build:` en compose)
2. `findOrphanServiceDirs(repoPath, compose)` → encuentra `frontend/` (tiene `Dockerfile`, no está en `usedContexts`)
3. Clasificación: `backend` → role `backend` (imagen `php`), `frontend` → role `frontend` (imagen `node`/`nginx` + `vite`/`react`)
4. Resultado: `{ mode: 'dual', backend: {...desde compose...}, frontend: {...huérfano, puerto desde EXPOSE...} }`
5. `deployDualService` construye ambas imágenes y las enruta:
   - `testmny.stardest.com/api/*` → backend
   - `testmny.stardest.com/*` → frontend

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar `IGNORED_DIRS`, `getComposeBuildContexts`, `findOrphanServiceDirs` |
| `deploy_panel/apps/builder/index.js` | Agregar `detectPortFromDockerfile` |
| `deploy_panel/apps/builder/index.js` | Reemplazar `resolveMultiServiceDeploy` por la versión que incluye huérfanos |
| `deploy_panel/apps/builder/index.js` | Verificar que la llamada en `deployApp` sigue funcionando con `compose === null` |

## Notas

- Solo se escanean carpetas de **primer nivel** del repo (no recursivo) — suficiente para la mayoría de monorepos típicos (`backend/`, `frontend/`, `client/`, `server/`)
- Si hay más de una carpeta huérfana candidata (ej. `frontend/` y `admin-panel/` ambas con Dockerfile), el sistema solo puede manejar el caso de exactamente 2 servicios totales (1 backend + 1 frontend) — si hay 3+ candidatos válidos, caerá en el fallback de modo `single` con advertencia en logs. Soportar 3+ servicios simultáneos queda fuera del alcance de este documento
- Las carpetas en `IGNORED_DIRS` (`node_modules`, `.git`, `database`, etc.) nunca se consideran candidatas a servicio, aunque tengan accidentalmente un archivo llamado `Dockerfile` dentro
