# Instrucciones: Asociar deploys a usuarios

## Contexto

Actualmente `POST /deploy` crea contenedores Docker con labels pero sin guardar quién hizo el deploy. `GET /deploys` devuelve todos los contenedores a cualquiera.

El sistema de auth usa **JWT** — el token viaja en el header `Authorization: Bearer <token>` y contiene `{ id, name, email, provider }`.

---

## PASO 1 — Backend: guardar el usuario en el label del contenedor

En `deploy_panel/apps/builder/index.js`, en la ruta `POST /deploy`, extraer el usuario del JWT y agregarlo como label al contenedor.

### Cambio en `POST /deploy`

```javascript
app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain, branch } = req.body;
    if (!repoUrl || !subdomain) return res.status(400).send("Faltan datos: repoUrl o subdomain");

    // Extraer usuario del token JWT
    let userId = 'anonymous';
    let userEmail = 'anonymous';
    const authHeader = req.headers.authorization;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
            userId = decoded.id || 'anonymous';
            userEmail = decoded.email || 'anonymous';
        } catch (e) {
            // token inválido, continuar como anonymous
        }
    }

    const actualBranch = branch || 'main';
    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch, userId, userEmail);
        saveDeployment(repoUrl, actualBranch, subdomain);
        res.json({
            status: 'success',
            url: url,
            message: 'Aplicación desplegada exitosamente',
            branch: actualBranch,
            deployedAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});
```

### Cambio en `deployApp` — agregar parámetros y label

Cambiar la firma de la función:
```javascript
async function deployApp(repoUrl, subdomain, branch, userId = 'anonymous', userEmail = 'anonymous') {
```

En el `docker.createContainer`, agregar los labels de usuario:
```javascript
Labels: {
    "traefik.enable": "true",
    [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
    [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
    [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000",
    "deploy.branch": branch || "main",
    "deploy.repo": repoUrl,
    "deploy.timestamp": new Date().toISOString(),
    "deploy.userId": userId,         // 👈 nuevo
    "deploy.userEmail": userEmail,   // 👈 nuevo
},
```

---

## PASO 2 — Backend: filtrar `/deploys` por usuario

Cambiar `GET /deploys` para que si hay token válido, devuelva solo los deploys del usuario. Si no hay token, devuelve todos (para uso interno/admin).

```javascript
app.get('/deploys', async (req, res) => {
    try {
        // Intentar extraer userId del token
        let filterUserId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'dev-secret');
                filterUserId = decoded.id || null;
            } catch (e) {
                // token inválido, mostrar todos
            }
        }

        const containers = await docker.listContainers({ all: true });
        const deploys = containers
            .filter(c => c.Names.some(name => name.includes('container-')))
            .filter(c => {
                // Si hay usuario autenticado, filtrar por su ID
                if (!filterUserId) return true;
                return c.Labels['deploy.userId'] === filterUserId;
            })
            .map(c => ({
                subdomain: c.Names[0].replace('/container-', ''),
                status: c.State,
                branch: c.Labels['deploy.branch'] || 'unknown',
                repo: c.Labels['deploy.repo'] || 'unknown',
                deployedAt: c.Labels['deploy.timestamp'] || 'unknown',
                userId: c.Labels['deploy.userId'] || 'unknown',
                userEmail: c.Labels['deploy.userEmail'] || 'unknown',
            }));

        res.json({ status: 'success', deploys });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});
```

---

## PASO 3 — Frontend: enviar token en la request de `/deploys`

En `Dashboard.jsx`, el fetch a `/api/deploys` debe incluir el token JWT:

```javascript
useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('auth_token');
    fetch('/api/deploys', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') setDeploys(data.deploys);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
}, [user]);
```

---

## PASO 4 — Frontend: enviar token al hacer deploy

En `Deploy.jsx`, el fetch a `POST /deploy` o `POST /api/deploy/upload` debe incluir el token:

### Para deploy desde Git (`POST /deploy`):
```javascript
const token = localStorage.getItem('auth_token');

const response = await fetch('/deploy', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ repoUrl, subdomain, branch })
});
```

### Para deploy por drag & drop (`POST /api/deploy/upload`):
El XHR ya existe, agregar el header:
```javascript
xhr.open('POST', '/api/deploy/upload');
const token = localStorage.getItem('auth_token');
if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
xhr.send(formData);
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | `deployApp` acepta `userId` y `userEmail` como parámetros |
| `deploy_panel/apps/builder/index.js` | `POST /deploy` extrae usuario del JWT y lo pasa a `deployApp` |
| `deploy_panel/apps/builder/index.js` | `docker.createContainer` agrega labels `deploy.userId` y `deploy.userEmail` |
| `deploy_panel/apps/builder/index.js` | `GET /deploys` filtra por `deploy.userId` si hay token |
| `deploy_panel/apps/web/src/pages/Dashboard.jsx` | fetch a `/api/deploys` incluye `Authorization` header |
| `deploy_panel/apps/web/src/pages/Deploy.jsx` | fetch a `/deploy` y XHR a `/api/deploy/upload` incluyen `Authorization` header |

## Nota importante

Los deploys **anteriores** no tienen el label `deploy.userId` porque se hicieron antes de este cambio. Esos no aparecerán en el dashboard de ningún usuario hasta que se redesplieguen. Esto es el comportamiento correcto — los deploys nuevos sí quedarán asociados al usuario.
