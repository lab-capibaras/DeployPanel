# Fix: Credenciales de DB no aparecen en deploys duales agrupados

## Problema

En `GET /deploys` (PASO 7 de `dual-service-deploy.md`), el agrupamiento por subdominio asigna el campo `database` **solo en el momento de crear la entrada**:

```javascript
if (!grouped[subdomain]) {
    grouped[subdomain] = {
        // ...
        database: labels['deploy.db.type'] ? { ... } : null,  // 👈 solo aquí
    };
}
```

`docker.listContainers()` no garantiza el orden en que aparecen los contenedores. Si el contenedor del **frontend** (que no tiene labels `deploy.db.*`) se procesa antes que el del **backend** (que sí los tiene), la entrada del subdominio se crea con `database: null` y **nunca se actualiza**, aunque luego se procese el backend con las credenciales correctas.

---

## Fix

En `deploy_panel/apps/builder/index.js`, dentro del `for (const c of appContainers)` de `GET /deploys`, agregar una actualización del campo `database` en **cada iteración**, no solo al crear la entrada:

```javascript
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
            database: null,
        };
    }

    grouped[subdomain].roles.push(labels['deploy.role'] || 'app');
    if (c.State !== 'running') grouped[subdomain].status = c.State;

    // 👇 FIX: actualizar database en cada iteración, sin importar el orden
    if (labels['deploy.db.type'] && !grouped[subdomain].database) {
        grouped[subdomain].database = {
            type:       labels['deploy.db.type'],
            host:       labels['deploy.db.host'],
            port:       labels['deploy.db.port'],
            name:       labels['deploy.db.name'],
            user:       labels['deploy.db.user'],
            password:   labels['deploy.db.password'],
            adminerUrl: labels['deploy.db.adminerUrl'] || null,
        };
    }

    // También actualizar deployedAt si este contenedor es más reciente (opcional pero recomendado)
    if (labels['deploy.timestamp'] && labels['deploy.timestamp'] > grouped[subdomain].deployedAt) {
        grouped[subdomain].deployedAt = labels['deploy.timestamp'];
    }
}
```

---

## Resumen

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | En `GET /deploys`: mover la asignación de `database` fuera del bloque `if (!grouped[subdomain])`, para que se evalúe en cada contenedor del grupo, no solo al crear la entrada |

## Después de aplicar y hacer push

No requiere redeploy de las apps — este fix es solo de **lectura** de labels que ya existen en los contenedores. En cuanto el `deploy_panel` se reconstruya con el fix, el Dashboard mostrará las credenciales correctamente en el próximo refresh, sin necesidad de tocar `mnyfl7` ni ningún otro deploy existente.
