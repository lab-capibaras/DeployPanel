# Instrucciones: Soporte para monorepos con docker-compose.yml en la raíz

## Contexto

Algunos repos no tienen el `Dockerfile` en la raíz, sino dentro de una subcarpeta (ej. `backend/Dockerfile`), y usan un `docker-compose.yml` en la raíz para orquestar varios servicios (app + base de datos + phpMyAdmin, etc).

El sistema actual:
- Solo busca `Dockerfile` en la raíz del repo → no lo encuentra y cae en Buildpacks (que falla porque no hay `docker` binario en el contenedor)
- `detectPort` toma el primer match de `ports:` en el `docker-compose.yml`, que puede ser el de la base de datos (`3306`) en vez del de la app (`8080`)

Hay que parsear el `docker-compose.yml` correctamente para identificar **cuál servicio es la app** (no la base de datos, no phpMyAdmin/Adminer) y usar su `build.context`, `build.dockerfile` y su puerto real.

---

## PASO 1 — Instalar dependencia para parsear YAML

```bash
cd ~/deploys/deploy_panel && npm install js-yaml
```

---

## PASO 2 — Agregar función `parseDockerCompose`

En `deploy_panel/apps/builder/index.js`, agregar antes de `deployApp`:

```javascript
const yaml = require('js-yaml');

function parseDockerCompose(repoPath) {
    const composeNames = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const name of composeNames) {
        const composePath = path.join(repoPath, name);
        if (fs.existsSync(composePath)) {
            try {
                const content = fs.readFileSync(composePath, 'utf8');
                return yaml.load(content);
            } catch (e) {
                console.warn(`[Compose] Error parseando ${name}: ${e.message}`);
                return null;
            }
        }
    }
    return null;
}
```

---

## PASO 3 — Agregar función `findAppService`

Esta función identifica cuál servicio del `docker-compose.yml` es la aplicación principal (no la base de datos, no herramientas de administración).

```javascript
const INFRA_IMAGE_PATTERNS = [
    'mysql', 'mariadb', 'postgres', 'postgresql', 'mongo', 'redis',
    'phpmyadmin', 'adminer', 'pgadmin', 'mailhog', 'rabbitmq',
    'elasticsearch', 'memcached', 'nginx-proxy', 'traefik',
];

function isInfraService(serviceName, serviceConfig) {
    const image = (serviceConfig.image || '').toLowerCase();
    const name = serviceName.toLowerCase();
    return INFRA_IMAGE_PATTERNS.some(pattern => image.includes(pattern) || name.includes(pattern));
}

function findAppService(compose) {
    if (!compose || !compose.services) return null;

    const services = compose.services;
    const serviceNames = Object.keys(services);

    // 1. Buscar el servicio que tenga 'build' y no sea infra conocida
    for (const name of serviceNames) {
        const svc = services[name];
        if (svc.build && !isInfraService(name, svc)) {
            return { name, config: svc };
        }
    }

    // 2. Si ninguno tiene 'build' explícito, buscar el primero que no sea infra
    for (const name of serviceNames) {
        const svc = services[name];
        if (!isInfraService(name, svc)) {
            return { name, config: svc };
        }
    }

    return null;
}
```

---

## PASO 4 — Agregar función `resolveAppServicePort`

```javascript
function resolveAppServicePort(serviceConfig) {
    if (!serviceConfig.ports || serviceConfig.ports.length === 0) return null;

    for (const portEntry of serviceConfig.ports) {
        // Formatos posibles: "8080:80", "80", { target: 80, published: 8080 }
        if (typeof portEntry === 'string') {
            const parts = portEntry.split(':');
            const containerPort = parts.length > 1 ? parts[1] : parts[0];
            const cleanPort = containerPort.replace(/\/(tcp|udp)$/, '');
            if (cleanPort && !isNaN(cleanPort)) return cleanPort;
        } else if (typeof portEntry === 'object' && portEntry.target) {
            return portEntry.target.toString();
        }
    }
    return null;
}
```

---

## PASO 5 — Agregar función para mapear variables de entorno de la app a las credenciales de la DB provisionada

Muchos repos usan nombres de variables distintos a `MYSQLHOST`/`MYSQLUSER` (ej. `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`). Esta función detecta qué nombres usa el servicio de la app y genera el mapeo correcto automáticamente.

```javascript
function mapAppEnvToDbCredentials(serviceConfig, dbServiceName, dbCredentials) {
    const envOverrides = [];
    const rawEnv = serviceConfig.environment;

    if (!rawEnv) return envOverrides;

    // environment puede ser array ["KEY=value"] o objeto { KEY: value }
    const envEntries = Array.isArray(rawEnv)
        ? rawEnv.map(e => {
              const [key, ...rest] = e.split('=');
              return [key, rest.join('=')];
          })
        : Object.entries(rawEnv);

    for (const [key, value] of envEntries) {
        const valStr = String(value).toLowerCase();
        const keyUpper = key.toUpperCase();

        // Si el valor original apuntaba al nombre del servicio de DB (ej. "db")
        if (dbServiceName && valStr === dbServiceName.toLowerCase()) {
            envOverrides.push(`${key}=${dbCredentials.dbHost}`);
            continue;
        }

        // Mapear por patrón en el nombre de la variable
        if (/HOST$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbHost}`);
        } else if (/PORT$/.test(keyUpper) && !/^APP_PORT|^PORT$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbPort}`);
        } else if (/(DB_NAME|DATABASE)$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbName}`);
        } else if (/(DB_USER|USERNAME|^DB_USER$)/.test(keyUpper) && /USER/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbUser}`);
        } else if (/(PASS|PASSWORD)$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbPassword}`);
        }
        // Si no matchea ningún patrón conocido, no se sobreescribe (se ignora ese env var del compose)
    }

    return envOverrides;
}
```

---

## PASO 6 — Integrar todo en `deployApp`

En `deployApp`, **antes** del bloque existente que detecta `hasDockerfile`, agregar la detección de monorepo:

```javascript
// Detectar si hay un docker-compose.yml en la raíz con un servicio de app en subcarpeta
const compose = parseDockerCompose(repoPath);
let monorepoApp = null;

if (compose) {
    const appService = findAppService(compose);
    if (appService && appService.config.build) {
        const buildConfig = appService.config.build;
        const buildContext = typeof buildConfig === 'string' ? buildConfig : (buildConfig.context || '.');
        const dockerfileRelative = typeof buildConfig === 'object' ? (buildConfig.dockerfile || 'Dockerfile') : 'Dockerfile';

        const absoluteContext = path.join(repoPath, buildContext);
        const absoluteDockerfile = path.join(absoluteContext, dockerfileRelative);

        if (fs.existsSync(absoluteDockerfile)) {
            console.log(`[Compose] App detectada en docker-compose.yml: servicio "${appService.name}"`);
            console.log(`[Compose] Build context: ${buildContext}, Dockerfile: ${dockerfileRelative}`);

            monorepoApp = {
                serviceName: appService.name,
                buildContext: absoluteContext,
                dockerfilePath: absoluteDockerfile,
                port: resolveAppServicePort(appService.config),
                serviceConfig: appService.config,
            };
        }
    }
}
```

Modificar la condición `if (hasDockerfile)` para que también entre cuando hay `monorepoApp`:

```javascript
if (hasDockerfile || monorepoApp) {
    console.log(monorepoApp
        ? `Monorepo detectado. Usando Dockerfile en ${monorepoApp.buildContext}...`
        : `Dockerfile detectado. Usando build tradicional...`);

    const buildContext = monorepoApp ? monorepoApp.buildContext : repoPath;
    const dockerfileName = monorepoApp ? path.basename(monorepoApp.dockerfilePath) : 'Dockerfile';

    const stream = await docker.buildImage(
        { context: buildContext, src: ['.'] },
        { t: imageName, dockerfile: dockerfileName }
    );
    await runDockerBuild(stream);

} else if (isNextJs) {
    // ... resto de la cadena existente sin cambios
```

---

## PASO 7 — Usar el puerto del monorepo si está disponible

Donde se calcula `appPort` (de `auto-port.md`), darle prioridad al puerto del servicio de monorepo:

```javascript
let appPort = monorepoApp?.port || detectPort(repoPath);

if (!appPort) {
    appPort = '3000'; // fallback final
}

console.log(`[Port] Puerto final para ${subdomain}: ${appPort}`);
```

---

## PASO 8 — Inyectar variables de entorno mapeadas al contenedor

Donde se construye el array `Env` del contenedor del app (después de provisionar la DB), agregar las variables mapeadas si hay `monorepoApp`:

```javascript
let envVars = [];

if (dbCredentials) {
    // Variables estándar (ya existentes de auto-database.md)
    envVars = dbCredentials.dbType === 'mysql' ? [
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

    // Variables específicas detectadas del docker-compose.yml original del repo
    if (monorepoApp) {
        const dbServiceName = Object.keys(compose.services).find(name => {
            const svc = compose.services[name];
            return isInfraService(name, svc) && (svc.image || '').toLowerCase().includes(dbCredentials.dbType);
        });
        const mappedEnv = mapAppEnvToDbCredentials(monorepoApp.serviceConfig, dbServiceName, dbCredentials);
        envVars = [...envVars, ...mappedEnv];
        console.log(`[Compose] Variables de entorno mapeadas: ${mappedEnv.join(', ')}`);
    }
}
```

Usar `envVars` en el `Env:` del `docker.createContainer` en lugar del array hardcodeado anterior.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/package.json` | Agregar dependencia `js-yaml` |
| `deploy_panel/apps/builder/index.js` | Agregar `parseDockerCompose` |
| `deploy_panel/apps/builder/index.js` | Agregar `isInfraService` y `findAppService` |
| `deploy_panel/apps/builder/index.js` | Agregar `resolveAppServicePort` |
| `deploy_panel/apps/builder/index.js` | Agregar `mapAppEnvToDbCredentials` |
| `deploy_panel/apps/builder/index.js` | En `deployApp`: detectar monorepo antes de la cadena de detección existente |
| `deploy_panel/apps/builder/index.js` | Modificar condición `hasDockerfile` para incluir `monorepoApp` |
| `deploy_panel/apps/builder/index.js` | `appPort` prioriza el puerto del servicio de monorepo |
| `deploy_panel/apps/builder/index.js` | `Env` del contenedor incluye variables mapeadas del compose original |

---

## Ejemplo con el repo de referencia (MoneyFlu)

```
docker-compose.yml (raíz)
├── db          → mysql:8.0           (ignorado, es infra)
├── backend     → build: ./backend    (detectado como app)
│                 ports: ["8080:80"]
│                 environment: DB_HOST=db, DB_NAME=finanzas_db, ...
└── phpmyadmin  → phpmyadmin:latest   (ignorado, es infra)
```

Resultado esperado:
- `monorepoApp.buildContext` → `<repoPath>/backend`
- `monorepoApp.dockerfilePath` → `<repoPath>/backend/Dockerfile`
- `monorepoApp.port` → `"80"` (puerto interno del contenedor, no el 8080 publicado)
- Variables inyectadas: `DB_HOST=db-eltest`, `DB_NAME=db_eltest`, `DB_USER=user_eltest`, `DB_PASS=<generada>` (usando los mismos nombres que el repo original espera)

---

## Notas importantes

- El servicio de base de datos definido en el `docker-compose.yml` del repo **se ignora completamente** — StarDest siempre provisiona su propia base de datos vía `provisionDatabase` (de `auto-database.md`), nunca usa la imagen de DB declarada en el compose del usuario
- Si el repo no tiene `docker-compose.yml`, todo el flujo de detección anterior (`isNextJs`, `isVite`, etc.) sigue funcionando igual, sin cambios
- Si `findAppService` no encuentra ningún servicio con `build`, el sistema sigue cayendo en la cadena de detección normal (Next.js, Vite, Python, Node, Static, Buildpacks)
