# Instrucciones: Manejo automático de bases de datos (estilo Railway)

## Contexto

El sistema actual despliega apps pero no provee base de datos. Si el repo necesita MySQL o PostgreSQL, el deploy falla con errores de conexión.

El objetivo es que durante el deploy, el sistema:
1. Detecte si el repo necesita una base de datos
2. Cree automáticamente un contenedor MySQL o PostgreSQL
3. Inyecte las variables de entorno al contenedor del app
4. Guarde las credenciales en los labels del contenedor para mostrarlas en el dashboard

---

## PASO 1 — Backend: detectar si el repo necesita DB

En `deploy_panel/apps/builder/index.js`, dentro de `deployApp`, después de clonar el repo agregar la función de detección:

```javascript
// Detectar tipo de base de datos que necesita el repo
function detectDatabase(repoPath) {
    const filesToCheck = [
        path.join(repoPath, '.env.example'),
        path.join(repoPath, '.env.sample'),
        path.join(repoPath, 'docker-compose.yml'),
        path.join(repoPath, 'docker-compose.yaml'),
        path.join(repoPath, 'railway.toml'),
        path.join(repoPath, 'railway.json'),
    ];

    let content = '';
    for (const f of filesToCheck) {
        if (fs.existsSync(f)) {
            content += fs.readFileSync(f, 'utf8').toLowerCase();
        }
    }

    // También revisar package.json y requirements.txt
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        const mysqlDeps = ['mysql', 'mysql2', 'sequelize', 'typeorm', 'prisma', 'knex'];
        const pgDeps = ['pg', 'postgres', 'sequelize', 'typeorm', 'prisma', 'knex'];
        if (mysqlDeps.some(d => deps.includes(d))) content += ' mysql';
        if (pgDeps.some(d => deps.includes(d))) content += ' postgres';
    }

    const reqPath = path.join(repoPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
        const req = fs.readFileSync(reqPath, 'utf8').toLowerCase();
        if (req.includes('mysqlclient') || req.includes('pymysql') || req.includes('mysql')) content += ' mysql';
        if (req.includes('psycopg') || req.includes('asyncpg') || req.includes('postgres')) content += ' postgres';
    }

    // Detectar por variables de entorno en archivos de config PHP
    const phpFiles = ['config/db.php', 'config/database.php', 'app/config/database.php'];
    for (const phpFile of phpFiles) {
        const phpPath = path.join(repoPath, phpFile);
        if (fs.existsSync(phpPath)) {
            const phpContent = fs.readFileSync(phpPath, 'utf8').toLowerCase();
            if (phpContent.includes('mysql')) content += ' mysql';
            if (phpContent.includes('pgsql') || phpContent.includes('postgres')) content += ' postgres';
        }
    }

    if (content.includes('mysql') || content.includes('mariadb') ||
        content.includes('mysqlhost') || content.includes('mysqldatabase')) {
        return 'mysql';
    }
    if (content.includes('postgres') || content.includes('postgresql') ||
        content.includes('pghost') || content.includes('database_url')) {
        return 'postgres';
    }
    return null; // No necesita DB
}
```

---

## PASO 2 — Backend: función para crear contenedor de DB

Agregar esta función en `index.js`:

```javascript
async function provisionDatabase(subdomain, dbType) {
    const dbName = `db_${subdomain}`.replace(/-/g, '_');
    const dbUser = `user_${subdomain}`.replace(/-/g, '_').substring(0, 16); // MySQL max 16 chars
    const dbPassword = require('crypto').randomBytes(12).toString('hex');
    const containerName = `db-${subdomain}`;

    // Verificar si ya existe
    const containers = await docker.listContainers({ all: true });
    const existing = containers.find(c => c.Names.includes(`/${containerName}`));
    if (existing) {
        console.log(`[DB] Contenedor ${containerName} ya existe, reutilizando...`);
        // Leer credenciales de los labels
        const labels = existing.Labels;
        return {
            containerName,
            dbType,
            dbName:     labels['db.name']     || dbName,
            dbUser:     labels['db.user']     || dbUser,
            dbPassword: labels['db.password'] || dbPassword,
            dbHost:     containerName,
            dbPort:     dbType === 'mysql' ? '3306' : '5432',
        };
    }

    console.log(`[DB] Provisionando ${dbType} para ${subdomain}...`);

    let dbContainer;
    if (dbType === 'mysql') {
        dbContainer = await docker.createContainer({
            Image: 'mysql:8',
            name: containerName,
            Env: [
                `MYSQL_ROOT_PASSWORD=${dbPassword}root`,
                `MYSQL_DATABASE=${dbName}`,
                `MYSQL_USER=${dbUser}`,
                `MYSQL_PASSWORD=${dbPassword}`,
            ],
            Labels: {
                'db.type':     'mysql',
                'db.name':     dbName,
                'db.user':     dbUser,
                'db.password': dbPassword,
                'db.subdomain': subdomain,
            },
            HostConfig: {
                NetworkMode: 'deploys_internal_network',
                RestartPolicy: { Name: 'always' },
            }
        });
    } else {
        dbContainer = await docker.createContainer({
            Image: 'postgres:16-alpine',
            name: containerName,
            Env: [
                `POSTGRES_DB=${dbName}`,
                `POSTGRES_USER=${dbUser}`,
                `POSTGRES_PASSWORD=${dbPassword}`,
            ],
            Labels: {
                'db.type':     'postgres',
                'db.name':     dbName,
                'db.user':     dbUser,
                'db.password': dbPassword,
                'db.subdomain': subdomain,
            },
            HostConfig: {
                NetworkMode: 'deploys_internal_network',
                RestartPolicy: { Name: 'always' },
            }
        });
    }

    await dbContainer.start();
    console.log(`[DB] ${dbType} iniciado: ${containerName}`);

    // Esperar que la DB esté lista (máx 30s)
    await new Promise(resolve => setTimeout(resolve, dbType === 'mysql' ? 15000 : 8000));

    return {
        containerName,
        dbType,
        dbName,
        dbUser,
        dbPassword,
        dbHost: containerName,
        dbPort: dbType === 'mysql' ? '3306' : '5432',
    };
}
```

---

## PASO 3 — Backend: integrar en `deployApp`

En la función `deployApp`, después de clonar el repo y detectar el tipo de proyecto, agregar la detección y provisión de DB:

```javascript
// Después del bloque de detección (isNextJs, isVite, isPython, isNode, isStatic)
// Agregar:

const dbType = detectDatabase(repoPath);
let dbCredentials = null;

if (dbType) {
    console.log(`[DB] Base de datos detectada: ${dbType}`);
    dbCredentials = await provisionDatabase(subdomain, dbType);
    console.log(`[DB] Credenciales listas para ${subdomain}`);
}
```

---

## PASO 4 — Backend: inyectar variables al contenedor del app

En `docker.createContainer`, cambiar el bloque para incluir las variables de entorno de la DB y guardar las credenciales en labels:

```javascript
const container = await docker.createContainer({
    Image: imageName,
    name: `container-${subdomain}`,
    Env: dbCredentials ? (
        dbCredentials.dbType === 'mysql' ? [
            `MYSQLHOST=${dbCredentials.dbHost}`,
            `MYSQLPORT=${dbCredentials.dbPort}`,
            `MYSQLDATABASE=${dbCredentials.dbName}`,
            `MYSQLUSER=${dbCredentials.dbUser}`,
            `MYSQLPASSWORD=${dbCredentials.dbPassword}`,
            // También como DATABASE_URL para ORMs
            `DATABASE_URL=mysql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ] : [
            `PGHOST=${dbCredentials.dbHost}`,
            `PGPORT=${dbCredentials.dbPort}`,
            `PGDATABASE=${dbCredentials.dbName}`,
            `PGUSER=${dbCredentials.dbUser}`,
            `PGPASSWORD=${dbCredentials.dbPassword}`,
            `DATABASE_URL=postgresql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ]
    ) : [],
    Labels: {
        "traefik.enable": "true",
        [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
        [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
        [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000",
        "deploy.branch": branch || "main",
        "deploy.repo": repoUrl,
        "deploy.timestamp": new Date().toISOString(),
        "deploy.userId": userId || 'anonymous',
        "deploy.userEmail": userEmail || 'anonymous',
        // Guardar info de DB en labels para mostrar en dashboard
        ...(dbCredentials ? {
            "deploy.db.type":     dbCredentials.dbType,
            "deploy.db.host":     dbCredentials.dbHost,
            "deploy.db.port":     dbCredentials.dbPort,
            "deploy.db.name":     dbCredentials.dbName,
            "deploy.db.user":     dbCredentials.dbUser,
            "deploy.db.password": dbCredentials.dbPassword,
        } : {}),
    },
    HostConfig: {
        NetworkMode: "deploys_internal_network",
        RestartPolicy: { Name: "always" },
        Privileged: true
    }
});
```

---

## PASO 5 — Backend: exponer credenciales en `GET /deploys`

En el map de `/deploys`, agregar los campos de DB:

```javascript
.map(c => ({
    subdomain: c.Names[0].replace('/container-', ''),
    status: c.State,
    branch: c.Labels['deploy.branch'] || 'unknown',
    repo: c.Labels['deploy.repo'] || 'unknown',
    deployedAt: c.Labels['deploy.timestamp'] || 'unknown',
    userId: c.Labels['deploy.userId'] || 'unknown',
    userEmail: c.Labels['deploy.userEmail'] || 'unknown',
    // Info de DB (solo si tiene)
    database: c.Labels['deploy.db.type'] ? {
        type:     c.Labels['deploy.db.type'],
        host:     c.Labels['deploy.db.host'],
        port:     c.Labels['deploy.db.port'],
        name:     c.Labels['deploy.db.name'],
        user:     c.Labels['deploy.db.user'],
        password: c.Labels['deploy.db.password'],
    } : null,
}));
```

---

## PASO 6 — Frontend: mostrar credenciales de DB en Dashboard

En `Dashboard.jsx`, agregar un estado para mostrar/ocultar las credenciales y mostrarlas en cada card que tenga DB:

```jsx
const [showDb, setShowDb] = useState({});

// Dentro de cada card, después de los botones de acción:
{deploy.database && (
    <div style={{ width: '100%', marginTop: 12 }}>
        <button
            onClick={() => setShowDb(prev => ({ ...prev, [deploy.subdomain]: !prev[deploy.subdomain] }))}
            style={{
                fontFamily: "'Jersey 10', monospace", fontSize: 13,
                padding: '6px 12px',
                background: 'rgba(255,180,0,0.08)',
                border: '1px solid rgba(255,180,0,0.25)',
                color: '#ffb400', cursor: 'pointer',
            }}
        >
            🗄️ {showDb[deploy.subdomain] ? 'Ocultar' : 'Ver'} credenciales DB
        </button>

        {showDb[deploy.subdomain] && (
            <div style={{
                marginTop: 8, padding: '12px 16px',
                background: 'rgba(255,180,0,0.05)',
                border: '1px solid rgba(255,180,0,0.2)',
                fontFamily: 'monospace', fontSize: 12,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
            }}>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Tipo</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.type}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Host</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.host}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Puerto</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.port}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Base de datos</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.name}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Usuario</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.user}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>Contraseña</span>
                <span style={{ color: '#e8eeff' }}>{deploy.database.password}</span>
                <span style={{ color: 'rgba(200,216,255,0.5)' }}>DATABASE_URL</span>
                <span style={{ color: '#00d4ff', gridColumn: '1 / -1', wordBreak: 'break-all' }}>
                    {deploy.database.type === 'mysql'
                        ? `mysql://${deploy.database.user}:${deploy.database.password}@${deploy.database.host}:${deploy.database.port}/${deploy.database.name}`
                        : `postgresql://${deploy.database.user}:${deploy.database.password}@${deploy.database.host}:${deploy.database.port}/${deploy.database.name}`
                    }
                </span>
            </div>
        )}
    </div>
)}
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar función `detectDatabase` |
| `deploy_panel/apps/builder/index.js` | Agregar función `provisionDatabase` |
| `deploy_panel/apps/builder/index.js` | En `deployApp`: detectar DB y llamar `provisionDatabase` |
| `deploy_panel/apps/builder/index.js` | En `docker.createContainer`: inyectar variables de DB y guardar en labels |
| `deploy_panel/apps/builder/index.js` | En `GET /deploys`: incluir campo `database` en el map |
| `deploy_panel/apps/web/src/pages/Dashboard.jsx` | Mostrar credenciales de DB con botón toggle |

## Notas importantes

- La DB se crea **una sola vez** por subdominio — si el contenedor ya existe, reutiliza las credenciales
- MySQL espera **15 segundos** para iniciar antes de lanzar el app (PostgreSQL 8 segundos)
- Las credenciales se generan aleatoriamente con `crypto.randomBytes`
- El schema/migrations del repo deben correrse manualmente o el app debe hacer auto-migrate al iniciar
- La DB persiste aunque se redespliegue el app — solo se borra si el usuario elimina el deploy manualmente
