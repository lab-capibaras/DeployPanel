# Instrucciones: Limpieza y protección de ruta /deploy

## Contexto

El login con Google y GitHub ya está funcionando en producción.
El backend usa `express-session` + `passport` y expone `GET /api/auth/me` que devuelve:

```json
{ "authenticated": true, "user": { "name": "Angel", "email": "...", "avatar": "..." } }
```

o

```json
{ "authenticated": false, "user": null }
```

El hook `useAuth` ya existe en `src/hooks/useAuth.js` y funciona correctamente.

---

## TAREA 1 — Eliminar logs de debug del backend

En `deploy_panel/apps/builder/index.js`, eliminar estas líneas que se agregaron para debuggear (están dentro del middleware del callback de Google):

```javascript
console.log('[Auth] Google callback recibido. Code:', req.query.code ? req.query.code.substring(0, 20) + '...' : 'NINGUNO');
console.log('[Auth] Host header:', req.headers.host);
console.log('[Auth] Protocol:', req.protocol);
console.log('[Auth] Original URL:', req.originalUrl);
```

Y también eliminar este log si existe:
```javascript
console.log('[Auth] Login exitoso:', req.user?.email);
```

No tocar nada más del backend.

---

## TAREA 2 — Proteger la ruta /deploy en el frontend

En `deploy_panel/apps/web/src/pages/Deploy.jsx`, agregar una redirección al login si el usuario no está autenticado.

### Implementación

Importar `useAuth` y `useNavigate` al inicio del archivo:

```javascript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
```

Al inicio del componente `Deploy` (o como se llame el componente principal de esa página), agregar:

```javascript
const { user, loading } = useAuth();
const navigate = useNavigate();

useEffect(() => {
    if (!loading && !user) {
        navigate('/login');
    }
}, [user, loading, navigate]);

if (loading) return null; // o un spinner
if (!user) return null;
```

### Comportamiento esperado

- Si el usuario no está logueado e intenta ir a `/deploy`, se redirige automáticamente a `/login`
- Si el usuario está logueado, ve el panel normalmente
- Durante la carga de la sesión (`loading: true`), no se muestra nada (evita flash de contenido)

---

## TAREA 3 — Verificar que useAuth.js existe y es correcto

El archivo debe estar en `deploy_panel/apps/web/src/hooks/useAuth.js` con este contenido exacto:

```javascript
import { useState, useEffect } from 'react';

export function useAuth() {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                setUser(data.authenticated ? data.user : null);
            })
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        setUser(null);
        window.location.href = '/login';
    };

    return { user, loading, logout };
}
```

Si el archivo ya existe con contenido diferente, reemplazarlo con este.

---

## Resumen

| Tarea | Archivo | Acción |
|-------|---------|--------|
| 1 | `deploy_panel/apps/builder/index.js` | Eliminar 4-5 líneas de console.log de debug |
| 2 | `deploy_panel/apps/web/src/pages/Deploy.jsx` | Agregar guard de autenticación |
| 3 | `deploy_panel/apps/web/src/hooks/useAuth.js` | Verificar/crear el hook |

Hacer push al terminar los 3 cambios.
