# Rate Limiting — apps/builder/index.js

## Contexto

El proyecto es **StarDest** (`stardest.com`). El backend es Express en `apps/builder/index.js`. No existe ningún rate limiting actualmente, lo que permite brute force en los endpoints de autenticación.

---

## Tarea 1 — Instalar dependencia

En `apps/builder/`:

```bash
npm install express-rate-limit
```

---

## Tarea 2 — `apps/builder/index.js`

### 2.1 Agregar import

Junto a los imports existentes:

```js
import rateLimit from 'express-rate-limit'
```

### 2.2 Definir los limiters

Agregar después de los imports y antes de las rutas:

```js
// Limiter para autenticación — 10 intentos cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera 15 minutos' }
})

// Limiter general para toda la API — 100 requests por minuto
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
})
```

### 2.3 Aplicar los limiters

Agregar antes de la definición de las rutas:

```js
// Auth — más restrictivo
app.use('/auth/google', authLimiter)
app.use('/auth/github', authLimiter)
app.use('/auth/logout', authLimiter)

// API general
app.use('/api', apiLimiter)
```

---

## Verificación

Hacer más de 10 requests seguidos a `/auth/google`:

```bash
for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" https://stardest.com/auth/google; done
```

A partir del request 11 debe responder `429 Too Many Requests`.
