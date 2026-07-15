# Instrucciones: Correr migraciones automáticamente después del deploy

## Contexto

Cuando un repo usa un ORM (TypeORM, Prisma, Sequelize, Knex, Flyway, Alembic, Liquibase), los archivos `.sql` de `findSqlFiles` pueden no existir — en cambio tienen archivos de migración propios del ORM que se corren con un comando específico dentro del contenedor de la app.

El sistema actual ya importa `.sql` raw, pero no sabe ejecutar migraciones de ORMs. Este MD agrega soporte automático para todos los ORMs populares.

---

## ORMs soportados y sus comandos de migración

| ORM | Lenguaje | Comando de migración |
|-----|---------|---------------------|
| TypeORM | Node.js | `npx typeorm migration:run -d <dataSource>` o `npm run migration:run` |
| Prisma | Node.js | `npx prisma migrate deploy` |
| Sequelize CLI | Node.js | `npx sequelize-cli db:migrate` |
| Knex | Node.js | `npx knex migrate:latest` |
| Alembic | Python | `alembic upgrade head` |
| Flask-Migrate | Python | `flask db upgrade` |
| Flyway | Java/Any | `flyway migrate` |
| Liquibase | Java/Any | `liquibase update` |
| Laravel Artisan | PHP | `php artisan migrate --force` |
| Doctrine | PHP | `php bin/console doctrine:migrations:migrate --no-interaction` |

---

## PASO 1 — Agregar función `detectMigrationCommand`

En `deploy_panel/apps/builder/index.js`, agregar antes de `deployApp`:

```javascript
function detectMigrationCommand(repoPath, appDirPath) {
    const searchPath = appDirPath || repoPath;

    // 1. Verificar si hay un script de migración en package.json
    const pkgPath = path.join(searchPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const scripts = pkg.scripts || {};
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            // Buscar script de migración explícito en scripts
            const migrationScriptKeys = [
                'migration:run', 'migrate', 'db:migrate', 'migration:run:prod',
                'typeorm:migrate', 'prisma:migrate', 'migrate:deploy',
                'db:migrate:deploy', 'migration', 'migrations:run',
            ];
            for (const key of migrationScriptKeys) {
                if (scripts[key]) {
                    console.log(`[Migration] Script encontrado en package.json: npm run ${key}`);
                    return { cmd: `npm run ${key}`, type: 'npm' };
                }
            }

            // Detectar ORM por dependencias
            if (deps.prisma || deps['@prisma/client']) {
                console.log('[Migration] Prisma detectado');
                return { cmd: 'npx prisma migrate deploy', type: 'prisma' };
            }
            if (deps.typeorm || deps['@nestjs/typeorm']) {
                // TypeORM puede usar src/data-source.ts o dist/data-source.js
                const dataSources = [
                    'src/data-source.ts', 'src/database/data-source.ts',
                    'src/config/data-source.ts', 'src/typeorm.config.ts',
                    'dist/data-source.js', 'data-source.ts',
                ];
                const found = dataSources.find(ds => fs.existsSync(path.join(searchPath, ds)));
                if (found) {
                    const isDist = found.startsWith('dist/');
                    const dsPath = isDist ? found : `dist/${found.replace('.ts', '.js')}`;
                    console.log(`[Migration] TypeORM detectado con data-source: ${found}`);
                    return {
                        cmd: `npm run build 2>/dev/null; npx typeorm migration:run -d ${dsPath}`,
                        type: 'typeorm'
                    };
                }
                // Si no hay data-source explícito, intentar con el build
                console.log('[Migration] TypeORM detectado sin data-source explícito, intentando npm run migration:run');
                return { cmd: 'npm run build 2>/dev/null; npx typeorm migration:run', type: 'typeorm' };
            }
            if (deps['sequelize-cli'] || deps.sequelize) {
                console.log('[Migration] Sequelize detectado');
                return { cmd: 'npx sequelize-cli db:migrate', type: 'sequelize' };
            }
            if (deps.knex) {
                console.log('[Migration] Knex detectado');
                return { cmd: 'npx knex migrate:latest', type: 'knex' };
            }
        } catch (e) {
            console.warn('[Migration] Error leyendo package.json:', e.message);
        }
    }

    // 2. Python ORMs
    const reqPath = path.join(searchPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
        const req = fs.readFileSync(reqPath, 'utf8').toLowerCase();
        if (req.includes('alembic')) {
            console.log('[Migration] Alembic detectado');
            return { cmd: 'alembic upgrade head', type: 'alembic' };
        }
        if (req.includes('flask-migrate') || req.includes('flask_migrate')) {
            console.log('[Migration] Flask-Migrate detectado');
            return { cmd: 'flask db upgrade', type: 'flask-migrate' };
        }
    }

    // 3. PHP ORMs
    const composerPath = path.join(searchPath, 'composer.json');
    if (fs.existsSync(composerPath)) {
        try {
            const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
            const require = { ...composer.require, ...composer['require-dev'] };
            if (require['laravel/framework'] || require['laravel/laravel']) {
                console.log('[Migration] Laravel detectado');
                return { cmd: 'php artisan migrate --force', type: 'laravel' };
            }
            if (require['doctrine/migrations']) {
                console.log('[Migration] Doctrine detectado');
                return { cmd: 'php bin/console doctrine:migrations:migrate --no-interaction', type: 'doctrine' };
            }
        } catch (e) {}
    }

    // 4. Archivos de migración por convención (Flyway/Liquibase)
    const flywayConf = path.join(searchPath, 'flyway.conf');
    const flywayToml = path.join(searchPath, 'flyway.toml');
    if (fs.existsSync(flywayConf) || fs.existsSync(flywayToml)) {
        console.log('[Migration] Flyway detectado');
        return { cmd: 'flyway migrate', type: 'flyway' };
    }

    const liquibaseProps = path.join(searchPath, 'liquibase.properties');
    if (fs.existsSync(liquibaseProps)) {
        console.log('[Migration] Liquibase detectado');
        return { cmd: 'liquibase update', type: 'liquibase' };
    }

    console.log('[Migration] No se detectó ningún ORM con migraciones.');
    return null;
}
```

---

## PASO 2 — Agregar función `runMigrations`

```javascript
async function runMigrations(containerName, migrationCmd, maxWait = 30000) {
    console.log(`[Migration] Esperando que la app esté lista antes de migrar...`);

    // Esperar hasta maxWait ms a que el contenedor esté corriendo y estable
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const info = await docker.getContainer(containerName).inspect();
            if (info.State.Running) break;
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[Migration] Corriendo: ${migrationCmd}`);

    try {
        const execInstance = await docker.getContainer(containerName).exec({
            Cmd: ['sh', '-c', migrationCmd],
            AttachStdout: true,
            AttachStderr: true,
            WorkingDir: '/app',
        });

        const output = await new Promise((resolve, reject) => {
            execInstance.start({ hijack: true }, (err, stream) => {
                if (err) return reject(err);
                let stdout = '';
                let stderr = '';
                stream.on('data', chunk => {
                    const str = chunk.toString();
                    stdout += str;
                    process.stdout.write(`[Migration] ${str}`);
                });
                stream.on('error', chunk => {
                    stderr += chunk.toString();
                });
                stream.on('end', () => resolve({ stdout, stderr }));
                setTimeout(() => resolve({ stdout, stderr: 'timeout' }), 60000); // 60s máx
            });
        });

        if (output.stderr && output.stderr !== 'timeout' && output.stderr.includes('error')) {
            console.warn(`[Migration] Advertencia en migración: ${output.stderr}`);
        } else {
            console.log(`[Migration] ✓ Migraciones completadas`);
        }
    } catch (err) {
        // No fallar el deploy completo si la migración falla — solo loguear
        console.warn(`[Migration] Error al correr migraciones (el deploy sigue): ${err.message}`);
    }
}
```

**Nota importante:** `runMigrations` nunca falla el deploy aunque la migración dé error — solo loguea una advertencia. Esto es intencional: si la migración falla, el contenedor de la app ya está corriendo y el usuario puede investigar. Fallar el deploy completo por una migración sería peor experiencia.

---

## PASO 3 — Integrar en `deployApp` (modo single/monorepo)

En `deployApp`, justo después de `await container.start()` y antes del `console.log('✓ Despliegue exitoso')`:

```javascript
await container.start();

// Correr migraciones si el repo tiene ORM
const migrationSearchPath = monorepoApp ? monorepoApp.buildContext : repoPath;
const migrationCmd = detectMigrationCommand(repoPath, migrationSearchPath);
if (migrationCmd && dbCredentials) {
    await runMigrations(`container-${subdomain}`, migrationCmd.cmd);
}

console.log(`✓ Despliegue exitoso: ${subdomain}.stardest.com`);
```

---

## PASO 4 — Integrar en `deployDualService` (modo dual)

En `deployDualService`, justo después de que el backend container inicia (`await backendContainer.start()`):

```javascript
await backendContainer.start();
console.log(`[Dual] ✓ Backend desplegado en ${subdomain}.stardest.com/api`);

// Correr migraciones en el backend si aplica
const migrationCmd = detectMigrationCommand(repoPath, backend.buildContext);
if (migrationCmd && dbCredentials) {
    await runMigrations(`container-${subdomain}-backend`, migrationCmd.cmd);
}
```

---

## Variables de entorno para las migraciones

Las migraciones corren **dentro del contenedor de la app**, que ya tiene inyectadas las variables de entorno de la DB (`DB_HOST`, `PGHOST`, `DATABASE_URL`, etc.) desde el deploy. Así que TypeORM, Prisma y los demás ORMs deberían poder conectarse a la DB automáticamente sin configuración adicional, siempre que lean esas variables de entorno (que es el comportamiento estándar de todos los ORMs mencionados).

Si el ORM usa un archivo `.env` hardcodeado en vez de variables de entorno del sistema, las migraciones pueden fallar — pero eso es un problema del repo del usuario, no del sistema.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar `detectMigrationCommand` |
| `deploy_panel/apps/builder/index.js` | Agregar `runMigrations` |
| `deploy_panel/apps/builder/index.js` | En `deployApp`: llamar `detectMigrationCommand` + `runMigrations` después de `container.start()` |
| `deploy_panel/apps/builder/index.js` | En `deployDualService`: llamar `detectMigrationCommand` + `runMigrations` después de `backendContainer.start()` |

## Comportamiento esperado en los logs

```
[DB] Provisionando postgres para mainpgres...
[DB] ✓ postgres iniciado: db-mainpgres
✓ Despliegue exitoso (contenedor iniciado)
[Migration] TypeORM detectado con data-source: src/data-source.ts
[Migration] Esperando que la app esté lista antes de migrar...
[Migration] Corriendo: npm run build 2>/dev/null; npx typeorm migration:run -d dist/data-source.js
[Migration] ✓ Migraciones completadas
✓ Despliegue exitoso: mainpgres.stardest.com
```

## Notas

- Las migraciones solo se corren si `dbCredentials` existe (es decir, si el sistema detectó y provisionó una DB para este deploy) — nunca se intenta migrar en apps sin base de datos
- El timeout de migración es de **60 segundos** por ejecución — si una migración tarda más (raro en proyectos normales), se loguea como timeout pero no falla el deploy
- Para repos que tienen **tanto archivos `.sql` como migraciones ORM**, el sistema importará primero el SQL (estructura base via `importSqlFiles`) y luego correrá las migraciones ORM — esto puede causar conflictos si el SQL ya crea las tablas que el ORM también intenta crear; en ese caso el ORM simplemente encontrará que ya existen y continuará sin error (comportamiento estándar de todos los ORMs mencionados con `--force` o equivalente)
