# Fix: Limpiar bases de datos huérfanas de deploys fallidos

## Problema

`provisionDatabase` reutiliza cualquier contenedor `db-${subdomain}` que ya exista, sin verificar si pertenece a un **deploy exitoso** (que el usuario quiere conservar al hacer Redeploy) o a un **intento fallido** que dejó la base de datos vacía y huérfana.

Esto causa que, si un primer intento de deploy crea la DB pero falla antes de importar el SQL (por el bug ya corregido en `fix-sql-path-monorepo.md`, o por cualquier otra razón), cualquier intento posterior con el mismo subdominio reutiliza esa DB vacía para siempre — incluso después de corregir el bug original, porque el contenedor de DB en sí nunca se recreó.

**Importante:** no se puede simplemente borrar la DB en cada deploy, porque eso destruiría los datos reales de un usuario que hace **Redeploy** de una app que ya está funcionando en producción.

---

## Fix

En `provisionDatabase`, antes de decidir si reutilizar la DB existente, verificar si **también existe** un contenedor de app corriendo para ese subdominio (`container-${subdomain}`, `container-${subdomain}-backend`, o `container-${subdomain}-frontend`). Si la DB existe pero **ningún** contenedor de app existe, se trata de un residuo huérfano de un deploy que nunca se completó — se borra la DB (y su Adminer) y se crea una nueva limpia.

En `deploy_panel/apps/builder/index.js`, modificar el inicio de `provisionDatabase`:

```javascript
async function provisionDatabase(subdomain, dbType, repoPath) {
    const dbName = `db_${subdomain}`.replace(/-/g, '_');
    const dbUser = `user_${subdomain}`.replace(/-/g, '_').substring(0, 16);
    const dbPassword = require('crypto').randomBytes(12).toString('hex');
    const containerName = `db-${subdomain}`;
    const internalPort = dbType === 'mysql' ? 3306 : 5432;

    const allContainers = await docker.listContainers({ all: true });
    const existing = allContainers.find(c => c.Names.includes(`/${containerName}`));

    if (existing) {
        // Verificar si hay un contenedor de app vivo asociado a este subdominio.
        // Si no hay ninguno, esta DB es huérfana de un deploy que nunca terminó con éxito.
        const hasLiveApp = allContainers.some(c =>
            c.Names.includes(`/container-${subdomain}`) ||
            c.Names.includes(`/container-${subdomain}-backend`) ||
            c.Names.includes(`/container-${subdomain}-frontend`)
        );

        if (!hasLiveApp) {
            console.warn(`[DB] Contenedor ${containerName} existe pero no hay app asociada — es residuo de un deploy fallido. Recreando limpio...`);

            // Borrar la DB huérfana
            await docker.getContainer(existing.Id).remove({ force: true });

            // Borrar también su Adminer huérfano, si existe
            const orphanAdminer = allContainers.find(c => c.Names.includes(`/adminer-${subdomain}`));
            if (orphanAdminer) {
                await docker.getContainer(orphanAdminer.Id).remove({ force: true });
            }

            // No retornar aquí — continuar el flujo normal de creación, más abajo
        } else {
            console.log(`[DB] Contenedor ${containerName} ya existe y hay una app asociada, reutilizando...`);
            const labels = existing.Labels;
            return {
                containerName,
                dbType,
                dbName:       labels['db.name']     || dbName,
                dbUser:       labels['db.user']     || dbUser,
                dbPassword:   labels['db.password'] || dbPassword,
                dbHost:       containerName,
                dbPort:       internalPort.toString(),
                externalPort: labels['db.externalPort'] || null,
                adminerUrl:   `https://db-${subdomain}.stardest.com`,
            };
        }
    }

    console.log(`[DB] Provisionando ${dbType} para ${subdomain}...`);
    // ... continúa igual que antes: crear el contenedor, esperar que inicie,
    //     buscar e importar SQL, crear Adminer, retornar credentials
}
```

---

## Por qué esto es seguro

| Escenario | ¿Hay app viva? | Resultado |
|---|---|---|
| Primer deploy de un subdominio nuevo | No (todavía no se creó) | Se crea DB nueva normalmente, flujo sin cambios |
| Redeploy de una app que funciona | Sí | Se reutiliza la DB existente — **los datos del usuario se conservan** |
| Deploy falló, dejó DB vacía huérfana, usuario reintenta | No (el contenedor de app nunca llegó a crearse o fue removido) | Se detecta la orfandad, se borra la DB vacía, se crea una limpia con el SQL importado correctamente |
| Usuario eliminó el deploy desde el Dashboard pero algo no se limpió | No | Igual que el caso anterior — se autocorrige |

Este chequeo se ejecuta automáticamente en **cada** deploy, sin que el usuario tenga que hacer nada manual — ni recordar borrar antes de reintentar, ni preocuparse por residuos.

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | En `provisionDatabase`: antes de reutilizar una DB existente, verificar que también exista un contenedor de app vivo para ese subdominio; si no, borrar la DB huérfana y crear una nueva |

## Nota sobre los residuos que ya existen ahora

Este fix previene el problema **hacia adelante**. Los contenedores `db-finalfinalv2` y `db-moneyflu` que ya borraste manualmente no necesitan nada más — pero si quedó algún otro subdominio de pruebas anteriores con el mismo problema, la próxima vez que hagas deploy sobre ese subdominio el sistema lo detectará y limpiará solo, sin que tengas que buscarlo manualmente.
