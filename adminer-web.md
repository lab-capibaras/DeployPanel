# Instrucciones: Adminer web para administrar bases de datos

## Contexto

En lugar de exponer puertos de MySQL/PostgreSQL a internet, cada base de datos creada automáticamente tendrá una interfaz web de administración (Adminer) accesible vía HTTPS en un subdominio, usando la misma infraestructura de Traefik + Cloudflare que ya funciona para el resto de la plataforma.

**Ventajas sobre exponer el puerto:**
- Cero puertos nuevos expuestos a internet
- Mismo nivel de seguridad que el resto de StarDest (HTTPS vía Cloudflare)
- El usuario no instala nada — abre el navegador y ya
- Adminer soporta MySQL, PostgreSQL, SQLite y más desde la misma interfaz

**Cómo se verá:** cada deploy con base de datos tendrá un botón en el Dashboard que abre `https://db-<subdomain>.stardest.com`, con el usuario y contraseña ya generados (el usuario solo pega las credenciales que ya ve en el dashboard).

---

## PASO 1 — Backend: crear contenedor Adminer junto a la DB

En `deploy_panel/apps/builder/index.js`, modificar `provisionDatabase` para que también levante un contenedor Adminer apuntando a la DB recién creada.

### Agregar después de que el contenedor de DB inicia (antes del `return credentials`):

```javascript
// Crear contenedor Adminer para administración web
const adminerContainerName = `adminer-${subdomain}`;

const existingAdminer = (await docker.listContainers({ all: true }))
    .find(c => c.Names.includes(`/${adminerContainerName}`));

if (!existingAdminer) {
    console.log(`[DB] Creando Adminer para ${subdomain}...`);

    const adminerContainer = await docker.createContainer({
        Image: 'adminer:latest',
        name: adminerContainerName,
        Env: [
            `ADMINER_DEFAULT_SERVER=${containerName}`,
        ],
        Labels: {
            "traefik.enable": "true",
            [`traefik.http.routers.${adminerContainerName}.rule`]: `Host(\`db-${subdomain}.stardest.com\`)`,
            [`traefik.http.routers.${adminerContainerName}.entrypoints`]: "web",
            [`traefik.http.services.${adminerContainerName}.loadbalancer.server.port`]: "8080",
            "db.subdomain": subdomain,
            "adminer.for": subdomain,
        },
        HostConfig: {
            NetworkMode: 'deploys_internal_network',
            RestartPolicy: { Name: 'always' },
        }
    });

    await adminerContainer.start();
    console.log(`[DB] Adminer disponible en: https://db-${subdomain}.stardest.com`);
} else {
    console.log(`[DB] Adminer ya existe para ${subdomain}, reutilizando...`);
}
```

---

## PASO 2 — Backend: agregar URL de Adminer a las credenciales retornadas

Modificar el objeto `credentials` que retorna `provisionDatabase` para incluir la URL:

```javascript
const credentials = {
    containerName,
    dbType,
    dbName,
    dbUser,
    dbPassword,
    dbHost: containerName,
    dbPort: internalPort.toString(),
    adminerUrl: `https://db-${subdomain}.stardest.com`,  // 👈 nuevo
};
```

Y en el bloque donde se reutiliza un contenedor existente (early return), agregar también:

```javascript
return {
    containerName,
    dbType,
    dbName:     labels['db.name']     || dbName,
    dbUser:     labels['db.user']     || dbUser,
    dbPassword: labels['db.password'] || dbPassword,
    dbHost:     containerName,
    dbPort:     dbType === 'mysql' ? '3306' : '5432',
    adminerUrl: `https://db-${subdomain}.stardest.com`,  // 👈 nuevo
};
```

---

## PASO 3 — Backend: guardar la URL de Adminer en labels del contenedor del app

En `deployApp`, donde se crea el contenedor del app con los labels de DB, agregar:

```javascript
...(dbCredentials ? {
    "deploy.db.type":       dbCredentials.dbType,
    "deploy.db.host":       dbCredentials.dbHost,
    "deploy.db.port":       dbCredentials.dbPort,
    "deploy.db.name":       dbCredentials.dbName,
    "deploy.db.user":       dbCredentials.dbUser,
    "deploy.db.password":   dbCredentials.dbPassword,
    "deploy.db.adminerUrl": dbCredentials.adminerUrl,  // 👈 nuevo
} : {}),
```

---

## PASO 4 — Backend: exponer la URL en `GET /deploys`

En el map de `/deploys`:

```javascript
database: c.Labels['deploy.db.type'] ? {
    type:       c.Labels['deploy.db.type'],
    host:       c.Labels['deploy.db.host'],
    port:       c.Labels['deploy.db.port'],
    name:       c.Labels['deploy.db.name'],
    user:       c.Labels['deploy.db.user'],
    password:   c.Labels['deploy.db.password'],
    adminerUrl: c.Labels['deploy.db.adminerUrl'] || null,  // 👈 nuevo
} : null,
```

---

## PASO 5 — Frontend: botón "Abrir Adminer" en Dashboard

En `Dashboard.jsx`, dentro del bloque de credenciales de DB que ya existe, agregar un botón destacado:

```jsx
{deploy.database.adminerUrl && (
    <div style={{ gridColumn: '1 / -1', marginTop: 12 }}>
        <a
            href={deploy.database.adminerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: "'Jersey 10', monospace",
                fontSize: 14,
                padding: '10px 18px',
                background: 'rgba(0,212,255,0.1)',
                border: '1px solid rgba(0,212,255,0.3)',
                color: '#00d4ff',
                textDecoration: 'none',
            }}
        >
            🗄️ Abrir Adminer →
        </a>
        <p style={{
            fontFamily: "'Jersey 10', monospace",
            fontSize: 12,
            color: 'rgba(200,216,255,0.4)',
            margin: '6px 0 0',
        }}>
            Usa el usuario y contraseña de arriba para iniciar sesión. Sistema: {deploy.database.type === 'mysql' ? 'MySQL' : 'PostgreSQL'}
        </p>
    </div>
)}
```

---

## PASO 6 — Servidor: levantar la imagen de Adminer

No requiere ningún paso manual adicional en el servidor — `docker.createContainer` descarga la imagen `adminer:latest` automáticamente la primera vez que se usa, igual que pasa con `mysql:8` o `postgres:16-alpine`.

Opcionalmente, para acelerar el primer deploy, puedes pre-descargar la imagen:

```bash
docker pull adminer:latest
```

---

## Resumen de cambios

| Acción | Lugar | Detalle |
|--------|-------|---------|
| Modificar | `deploy_panel/apps/builder/index.js` | `provisionDatabase` crea contenedor Adminer con label de Traefik |
| Modificar | `deploy_panel/apps/builder/index.js` | `provisionDatabase` retorna `adminerUrl` |
| Modificar | `deploy_panel/apps/builder/index.js` | `deployApp` guarda `deploy.db.adminerUrl` en labels |
| Modificar | `deploy_panel/apps/builder/index.js` | `GET /deploys` expone `adminerUrl` |
| Modificar | `Dashboard.jsx` | Botón "Abrir Adminer" con instrucciones |
| Opcional | Servidor | `docker pull adminer:latest` para acelerar primer deploy |

---

## Cómo se ve para el usuario final

En el Dashboard, cada deploy con base de datos muestra:

```
🗄️ Ver credenciales DB
   Tipo: mysql
   Usuario: user_miapp
   Contraseña: a3f9b2c1d4e5f6a7b8c9
   
   [🗄️ Abrir Adminer →]
   Usa el usuario y contraseña de arriba para iniciar sesión.
```

Al hacer clic en "Abrir Adminer", se abre `https://db-miapp.stardest.com` en una nueva pestaña con la pantalla de login de Adminer ya pre-rellenada con el servidor correcto (`ADMINER_DEFAULT_SERVER`). El usuario solo pega su usuario y contraseña, y puede ver/editar tablas, correr queries SQL, exportar datos, todo desde el navegador.

---

## Notas

- Cada base de datos tiene su propio Adminer dedicado — no hay un Adminer compartido entre usuarios, así que nadie puede ver las DBs de otros aunque conozca la URL (necesita las credenciales específicas)
- Adminer pesa ~15MB de imagen, el overhead de recursos es mínimo
- Si se elimina el deploy, el contenedor de Adminer debería eliminarse también (verificar que la lógica de `DELETE /deploy/:subdomain` también borre `adminer-${subdomain}` si existe)
