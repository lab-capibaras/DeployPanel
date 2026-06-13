# Instrucciones: Botón Redeploy en Dashboard

## Contexto

Cada deploy en el dashboard tiene `subdomain`, `repo` y `branch` disponibles desde `GET /api/deploys`.

El endpoint para redesplegar ya existe y funciona:

```
POST /deploy
Content-Type: application/json
Authorization: Bearer <token>

{
  "repoUrl": "https://github.com/user/repo",
  "subdomain": "mi-app",
  "branch": "main"
}
```

Respuesta exitosa:
```json
{ "status": "success", "url": "http://mi-app.stardest.com" }
```

---

## TAREA — Agregar botón Redeploy en `Dashboard.jsx`

### 1. Agregar estado para tracking de redeploys en curso

```javascript
const [redeploying, setRedeploying] = useState({}); 
// { "subdomain": true } cuando está en proceso
```

### 2. Agregar función `handleRedeploy`

```javascript
async function handleRedeploy(deploy) {
    if (deploy.repo === 'unknown' || deploy.repo === 'zip-upload') return;
    
    setRedeploying(prev => ({ ...prev, [deploy.subdomain]: true }));
    
    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch('/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                repoUrl: deploy.repo,
                subdomain: deploy.subdomain,
                branch: deploy.branch === 'unknown' ? 'main' : deploy.branch
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            // Actualizar el deployedAt en la lista
            setDeploys(prev => prev.map(d =>
                d.subdomain === deploy.subdomain
                    ? { ...d, deployedAt: data.deployedAt }
                    : d
            ));
        }
    } catch (err) {
        console.error('Error en redeploy:', err);
    } finally {
        setRedeploying(prev => ({ ...prev, [deploy.subdomain]: false }));
    }
}
```

### 3. Agregar el botón en cada card del dashboard

Dentro de la sección de acciones de cada deploy card, agregar el botón **Redeploy** junto a los botones existentes de "Visitar" y "Eliminar".

Solo mostrarlo si el deploy tiene un repo real (no si fue subido por drag & drop):

```jsx
{deploy.repo !== 'unknown' && deploy.repo !== 'zip-upload' && (
    <button
        onClick={() => handleRedeploy(deploy)}
        disabled={redeploying[deploy.subdomain]}
        style={{
            fontFamily: "'Jersey 10', monospace",
            fontSize: 14,
            padding: '8px 16px',
            background: redeploying[deploy.subdomain]
                ? 'rgba(0,212,255,0.04)'
                : 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.25)',
            color: redeploying[deploy.subdomain]
                ? 'rgba(0,212,255,0.4)'
                : '#00d4ff',
            cursor: redeploying[deploy.subdomain] ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
        }}
    >
        {redeploying[deploy.subdomain] ? (
            <>⟳ Desplegando...</>
        ) : (
            <>↻ Redeploy</>
        )}
    </button>
)}
```

---

## Comportamiento esperado

- El botón **Redeploy** aparece solo en deploys que tienen un repo de GitHub asociado
- Los deploys hechos por drag & drop (zip) **no** muestran el botón (su repo es `zip-upload`)
- Los deploys con repo `unknown` tampoco muestran el botón
- Al hacer clic: el botón cambia a "Desplegando..." y se deshabilita mientras corre el deploy
- Al terminar: el `deployedAt` de la card se actualiza a la hora actual
- Si falla: el botón vuelve a su estado normal (el error se loguea en consola)

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/web/src/pages/Dashboard.jsx` | Agregar estado `redeploying`, función `handleRedeploy` y botón en cada card |

No se requieren cambios en el backend.
