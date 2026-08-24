# Instrucciones: Límite de 3 deploys activos por usuario

## Contexto

Actualmente un usuario puede tener deploys ilimitados corriendo. Se agrega un límite de **3 proyectos activos** por cuenta. Al intentar hacer el deploy número 4, el sistema lo rechaza con un mensaje claro indicando que debe eliminar uno primero.

---

## CAMBIO — `POST /deploy` en `index.js`

Agregar la verificación **antes** del rate limiting existente (o justo después de extraer el `userId` del token), antes de llamar a `deployApp`:

```javascript
// Verificar límite de deploys activos por usuario
const MAX_DEPLOYS_PER_USER = 3;

const allContainers = await docker.listContainers({ all: true });
const userActiveDeployCount = allContainers.filter(c => {
    const isAppContainer =
        c.Names.some(n => n.startsWith('/container-')) &&
        !c.Names.some(n => n.startsWith('/container-') &&
            (n.endsWith('-backend') || n.endsWith('-frontend')));

    // Para modo dual, contar solo el backend (no el frontend por separado)
    const isDualBackend = c.Names.some(n => n.endsWith('-backend'));
    const isDualFrontend = c.Names.some(n => n.endsWith('-frontend'));

    const isUserContainer =
        c.Labels['deploy.userId'] === userId &&
        c.State === 'running' &&
        (isAppContainer || isDualBackend) &&
        !isDualFrontend;

    return isUserContainer;
}).length;

if (userActiveDeployCount >= MAX_DEPLOYS_PER_USER) {
    return res.status(403).json({
        status: 'error',
        code: 'DEPLOY_LIMIT_REACHED',
        details: `Alcanzaste el límite de ${MAX_DEPLOYS_PER_USER} proyectos activos. Elimina uno desde el Dashboard antes de desplegar uno nuevo.`,
        current: userActiveDeployCount,
        max: MAX_DEPLOYS_PER_USER,
    });
}
```

---

## Mostrar el error en `Deploy.jsx`

En el handler del fetch de deploy, agregar el caso `DEPLOY_LIMIT_REACHED` junto al de rate limiting:

```javascript
if (res.status === 403 && data.code === 'DEPLOY_LIMIT_REACHED') {
    setPhase('error');
    setErrorMessage(data.details);
    setShowDashboardLink(true);  // nuevo estado para mostrar link al Dashboard
    return;
}
```

Agregar el estado:
```jsx
const [showDashboardLink, setShowDashboardLink] = useState(false);
```

En la vista de error, si `showDashboardLink` es true:

```jsx
{phase === 'error' && (
    <div>
        <p style={{ color: '#f87171', marginBottom: 16 }}>{errorMessage}</p>
        {showDashboardLink && (
            <a
                href="/dashboard"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px',
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 8, textDecoration: 'none',
                    fontSize: 14, fontWeight: 600,
                }}
            >
                Ir al Dashboard →
            </a>
        )}
    </div>
)}
```

---

## Mostrar el límite en el Dashboard

En `Dashboard.jsx`, en el header donde dice "X proyectos activos", mostrar el límite:

```jsx
<p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
    {deploys.length} / 3 proyectos activos
    {deploys.length >= 3 && (
        <span style={{ color: '#f87171', marginLeft: 8 }}>
            · Límite alcanzado
        </span>
    )}
</p>
```

Y deshabilitar el botón "+ Nuevo Deploy" si ya tiene 3:

```jsx
<Link
    to="/deploy"
    style={{
        // ... estilos existentes ...
        opacity: deploys.length >= 3 ? 0.4 : 1,
        pointerEvents: deploys.length >= 3 ? 'none' : 'auto',
        cursor: deploys.length >= 3 ? 'not-allowed' : 'pointer',
    }}
    title={deploys.length >= 3 ? 'Elimina un proyecto para crear uno nuevo' : ''}
>
    + Nuevo Deploy
</Link>
```

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | `POST /deploy` verifica que el usuario no tenga 3 o más deploys activos antes de proceder |
| `deploy_panel/apps/web/src/pages/Deploy.jsx` | Manejar error `DEPLOY_LIMIT_REACHED` con mensaje claro y link al Dashboard |
| `deploy_panel/apps/web/src/pages/Dashboard.jsx` | Mostrar contador `X / 3` y deshabilitar botón "Nuevo Deploy" cuando el límite está alcanzado |

## Notas

- El conteo excluye los contenedores `-frontend` en modo dual para no contar un proyecto como dos
- Solo cuenta contenedores con `State: running` y el label `deploy.userId` del usuario — los deploys de otros usuarios no afectan el límite
- El redeploy de un proyecto existente **no** consume el límite — el usuario puede redesplegar cualquiera de sus 3 proyectos libremente
- Si se quiere cambiar el límite en el futuro, solo hay que cambiar `MAX_DEPLOYS_PER_USER = 3` en el backend y el `3` hardcodeado en el frontend
