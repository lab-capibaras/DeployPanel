# Migración JWT: localStorage → httpOnly Cookie

## Contexto
El proyecto es **StarDest** (`stardest.com`), un PaaS self-hosted. El backend es **Express** en `apps/builder/index.js`. El frontend es **React/Vite** en `apps/web/src/`.

Actualmente el JWT se almacena en `localStorage`, lo cual es vulnerable a XSS. El objetivo es migrarlo a una `httpOnly` cookie que el servidor emite y borra.

---

## Tarea 1 — Instalar dependencia

En `apps/builder/`, instalar `cookie-parser`:

```bash
npm install cookie-parser
```

---

## Tarea 2 — `apps/builder/index.js`

### 2.1 Agregar import y middleware

Agregar junto a los imports existentes:
```js
import cookieParser from 'cookie-parser'
```

Agregar junto a los `app.use()` existentes:
```js
app.use(cookieParser())
```

### 2.2 Actualizar CORS

Encontrar la llamada a `cors()` y reemplazarla por:
```js
app.use(cors({
  origin: 'https://stardest.com',
  credentials: true
}))
```

### 2.3 Callbacks de OAuth (Google y GitHub) — línea ~96

Encontrar ambos callbacks donde se hace `jwt.sign` y se redirige con el token en la URL. Reemplazar la redirección por:

```js
const token = jwt.sign({ ...payload }, process.env.JWT_SECRET, { expiresIn: '7d' })

res.cookie('auth_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
})

res.redirect('https://stardest.com/dashboard')
```

Hacer esto en el callback de Google **y** en el de GitHub.

### 2.4 Extraer middleware de autenticación

Encontrar los 3 lugares donde se verifica el JWT (`/auth/me` en línea ~109, y dos rutas protegidas en líneas ~542 y ~642). Reemplazar los 3 con un middleware centralizado, definido **una sola vez** antes de las rutas:

```js
const requireAuth = (req, res, next) => {
  const token = req.cookies.auth_token
  if (!token) return res.status(401).json({ error: 'No autorizado' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.clearCookie('auth_token')
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
```

Aplicar el middleware en las rutas protegidas:
```js
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// Y en las dos rutas de deploy/dashboard que antes verificaban manualmente
```

### 2.5 Logout — limpiar cookie desde el servidor

Encontrar `POST /auth/logout` y reemplazar su handler por:
```js
app.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  })
  res.json({ ok: true })
})
```

---

## Tarea 3 — `apps/web/src/hooks/useAuth.js`

- Eliminar **todas** las referencias a `localStorage.setItem`, `localStorage.getItem`, `localStorage.removeItem` relacionadas con el token JWT.
- Eliminar cualquier construcción manual del header `Authorization: Bearer ...`.
- En el fetch a `/auth/me`, asegurarse de incluir `credentials: 'include'`:

```js
const res = await fetch('/api/auth/me', {
  credentials: 'include'
})
```

---

## Tarea 4 — Configuración global de axios (si se usa)

Si existe una configuración global de axios en `apps/web/src/main.jsx` o `App.jsx`, agregar:

```js
axios.defaults.withCredentials = true
```

Si no existe configuración global, agregar `{ withCredentials: true }` en cada llamada axios que requiera autenticación.

---

## Tarea 5 — Verificación

Después de aplicar los cambios, verificar:

1. En DevTools → **Application → Local Storage** → no debe existir ninguna clave con el token.
2. En DevTools → **Application → Cookies → stardest.com** → debe aparecer `auth_token` con el flag **HttpOnly** activado.
3. En la consola del browser: `document.cookie` → **no debe mostrar** `auth_token`.
4. El flujo completo: login con Google/GitHub → redirige a `/dashboard` → usuario autenticado → logout → cookie eliminada.
