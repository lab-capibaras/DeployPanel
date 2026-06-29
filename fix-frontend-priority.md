# Fix: Prioridad del router de Traefik para el frontend en modo dual

## Problema

En `deployDualService`, el contenedor del frontend se registra en Traefik con:

```javascript
[`traefik.http.routers.${subdomain}-frontend.priority`]: "1",
```

El `static_server` (que sirve los sitios estáticos vía drag & drop / Git estático) tiene una regla wildcard:

```
HostRegexp(`{sub:[a-z0-9-]+}.stardest.com`)
```

con **prioridad 2**.

Como `2 > 1`, el wildcard del `static_server` le gana al router del frontend de cualquier deploy en modo dual, y Traefik responde con el 404 del `static_server` en vez de servir el frontend real — esto pasa para **cualquier ruta**, incluyendo rutas internas del SPA como `/login`, `/dashboard`, etc.

---

## Fix

En `deploy_panel/apps/builder/index.js`, dentro de la función `deployDualService`, cambiar la prioridad del router del frontend de `"1"` a `"5"` (mayor que el `2` del `static_server`, pero menor que el `"10"` del router del backend para que `/api/*` siga ganando):

```javascript
// ANTES:
[`traefik.http.routers.${subdomain}-frontend.priority`]: "1",

// DESPUÉS:
[`traefik.http.routers.${subdomain}-frontend.priority`]: "5",
```

No se requiere ningún otro cambio — el router del backend ya tiene prioridad `"10"`, que sigue siendo mayor que `"5"`, así que el orden de prioridades queda correctamente:

```
backend (PathPrefix /api)  → 10   (más específico, gana primero)
frontend (catch-all)       → 5    (gana sobre el wildcard de sitios estáticos)
static_server (wildcard)   → 2    (catch-all global de la plataforma)
```

---

## Resumen

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | En `deployDualService`: cambiar prioridad del router `${subdomain}-frontend` de `"1"` a `"5"` |

## Después de aplicar y hacer push

Los deploys dual **nuevos** quedarán correctos automáticamente. Los que ya están desplegados con la prioridad vieja (`1`) seguirán fallando hasta que se haga **Redeploy** desde el Dashboard, o se recreen manualmente los contenedores `container-<subdomain>-frontend` con la nueva prioridad.
