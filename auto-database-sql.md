# Instrucciones: Auto-importación de SQL en `provisionDatabase`

## Contexto

Cuando el sistema crea automáticamente un contenedor MySQL/PostgreSQL, las tablas no existen todavía. El repo normalmente tiene archivos `.sql` con el schema. Hay que importarlos automáticamente después de que la DB inicia.

Este documento es un **complemento** al MD `auto-database.md`. Solo modifica la función `provisionDatabase`.

---

## TAREA — Agregar función `findSqlFiles`

Agregar esta función en `deploy_panel/apps/builder/index.js` antes de `provisionDatabase`:

```javascript
function findSqlFiles(repoPath) {
    const results = [];

    // Orden de prioridad: schema primero, luego migrations, luego seeds
    const priorityPatterns = [
        /schema\.sql$/i,
        /init\.sql$/i,
        /create\.sql$/i,
        /structure\.sql$/i,
        /migration.*\.sql$/i,
        /migrate.*\.sql$/i,
        /.*\.sql$/i,
    ];

    // Directorios donde buscar
    const searchDirs = [
        repoPath,
        path.join(repoPath, 'database'),
        path.join(repoPath, 'db'),
        path.join(repoPath, 'sql'),
        path.join(repoPath, 'migrations'),
        path.join(repoPath, 'migrate'),
        path.join(repoPath, 'schema'),
    ];

    const found = new Set();

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (!file.endsWith('.sql')) continue;
                const fullPath = path.join(dir, file);
                if (!found.has(fullPath)) {
                    found.add(fullPath);
                }
            }
        } catch (e) {}
    }

    // Ordenar por prioridad
    const foundArray = Array.from(found);
    foundArray.sort((a, b) => {
        const aName = path.basename(a).toLowerCase();
        const bName = path.basename(b).toLowerCase();

        for (let i = 0; i < priorityPatterns.length; i++) {
            const aMatch = priorityPatterns[i].test(aName);
            const bMatch = priorityPatterns[i].test(bName);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
        }
        return aName.localeCompare(bName);
    });

    return foundArray;
}
```

---

## TAREA — Agregar función `importSqlFiles`

Agregar esta función después de `findSqlFiles`:

```javascript
async function importSqlFiles(sqlFiles, dbCredentials) {
    if (sqlFiles.length === 0) {
        console.log('[DB] No se encontraron archivos SQL para importar.');
        return;
    }

    console.log(`[DB] Importando ${sqlFiles.length} archivo(s) SQL...`);

    for (const sqlFile of sqlFiles) {
        const fileName = path.basename(sqlFile);
        console.log(`[DB] Importando: ${fileName}`);

        try {
            const sqlContent = fs.readFileSync(sqlFile, 'utf8');

            if (dbCredentials.dbType === 'mysql') {
                // Ejecutar SQL dentro del contenedor MySQL via dockerode
                const execInstance = await docker.getContainer(dbCredentials.containerName).exec({
                    Cmd: [
                        'mysql',
                        `-u${dbCredentials.dbUser}`,
                        `-p${dbCredentials.dbPassword}`,
                        '--force',
                        dbCredentials.dbName,
                    ],
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                });

                await new Promise((resolve, reject) => {
                    execInstance.start({ hijack: true, stdin: true }, (err, stream) => {
                        if (err) return reject(err);
                        stream.write(sqlContent);
                        stream.end();
                        stream.on('end', resolve);
                        stream.on('error', reject);
                        setTimeout(resolve, 10000); // timeout 10s por archivo
                    });
                });

            } else {
                // PostgreSQL
                const execInstance = await docker.getContainer(dbCredentials.containerName).exec({
                    Cmd: [
                        'psql',
                        `-U${dbCredentials.dbUser}`,
                        `-d${dbCredentials.dbName}`,
                    ],
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    Env: [`PGPASSWORD=${dbCredentials.dbPassword}`],
                });

                await new Promise((resolve, reject) => {
                    execInstance.start({ hijack: true, stdin: true }, (err, stream) => {
                        if (err) return reject(err);
                        stream.write(sqlContent);
                        stream.end();
                        stream.on('end', resolve);
                        stream.on('error', reject);
                        setTimeout(resolve, 10000);
                    });
                });
            }

            console.log(`[DB] ✓ ${fileName} importado`);

        } catch (err) {
            console.warn(`[DB] Warning al importar ${fileName}: ${err.message}`);
            // Continuar con el siguiente archivo aunque falle
        }
    }

    console.log('[DB] Importación SQL completada.');
}
```

---

## TAREA — Integrar en `provisionDatabase`

En la función `provisionDatabase`, después del `await new Promise(resolve => setTimeout(...))` que espera que la DB inicie, agregar la búsqueda e importación del SQL.

La función `provisionDatabase` recibe `repoPath` como nuevo parámetro:

### Cambiar la firma:
```javascript
async function provisionDatabase(subdomain, dbType, repoPath) {
```

### Agregar al final de `provisionDatabase`, antes del `return`:
```javascript
// Buscar e importar archivos SQL del repo
const sqlFiles = findSqlFiles(repoPath);
if (sqlFiles.length > 0) {
    console.log(`[DB] Archivos SQL encontrados: ${sqlFiles.map(f => path.basename(f)).join(', ')}`);
    await importSqlFiles(sqlFiles, credentials);
} else {
    console.log('[DB] No se encontraron archivos SQL en el repo.');
}

return credentials;
```

Donde `credentials` es el objeto que ya se retornaba:
```javascript
const credentials = {
    containerName,
    dbType,
    dbName,
    dbUser,
    dbPassword,
    dbHost: containerName,
    dbPort: dbType === 'mysql' ? '3306' : '5432',
};
```

---

## TAREA — Actualizar llamada a `provisionDatabase` en `deployApp`

En `deployApp`, donde se llama a `provisionDatabase`, agregar `repoPath`:

```javascript
// ANTES:
dbCredentials = await provisionDatabase(subdomain, dbType);

// DESPUÉS:
dbCredentials = await provisionDatabase(subdomain, dbType, repoPath);
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar función `findSqlFiles` |
| `deploy_panel/apps/builder/index.js` | Agregar función `importSqlFiles` |
| `deploy_panel/apps/builder/index.js` | `provisionDatabase` acepta `repoPath` y llama a `findSqlFiles` + `importSqlFiles` |
| `deploy_panel/apps/builder/index.js` | Llamada a `provisionDatabase` en `deployApp` pasa `repoPath` |

---

## Orden de importación de archivos SQL

```
1. schema.sql       ← estructura de tablas
2. init.sql
3. create.sql
4. structure.sql
5. migration*.sql   ← datos iniciales / cambios
6. migrate*.sql
7. cualquier *.sql  ← resto
```

Los archivos se buscan en:
- Raíz del repo
- `/database/`
- `/db/`
- `/sql/`
- `/migrations/`
- `/migrate/`
- `/schema/`

Si hay varios archivos se importan todos en orden con `--force` para ignorar errores de duplicados.

---

## Comportamiento esperado

```
GitHub push → deploy
    ↓
Detectar que necesita MySQL
    ↓
Crear contenedor mysql-miapp
    ↓
Esperar 15s que MySQL inicie
    ↓
Buscar *.sql en el repo → encontrar database/schema.sql
    ↓
Importar schema.sql con --force
    ↓
Lanzar container-miapp con variables de entorno
    ↓
App conecta a DB con tablas ya creadas ✅
```

## Nota sobre redespliegues

Si el usuario hace **Redeploy**, el contenedor de DB ya existe y `provisionDatabase` lo reutiliza. En ese caso **no** se vuelven a importar los SQL para evitar errores de duplicados. Solo se importan en el primer deploy.

Para forzar reimportación habría que eliminar el contenedor de DB manualmente o agregar una opción en el dashboard.
