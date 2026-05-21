# Instrucciones: Login con Google y GitHub

## Stack del proyecto
- Frontend: React + React Router v6, Tailwind CSS, estilo pixel/retro "StarDest"
- Backend: Express.js en `deploy_panel/apps/builder/index.js`, puerto 4000
- Acceso externo vía Traefik: `/api/*` → backend (strip prefix `/api`)
- Ya existe la ruta `/login` en el frontend con el componente `Login.jsx`

---

## Resumen de lo que hay que hacer

1. Instalar dependencias en el backend
2. Crear app OAuth en Google y GitHub (ver instrucciones abajo)
3. Agregar variables de entorno al `docker-compose.yml`
4. Agregar rutas de autenticación al `index.js` del backend
5. Reemplazar `Login.jsx` en el frontend
6. Agregar un hook `useAuth` para consumir la sesión en el frontend

---

## PASO 1 — Instalar dependencias

En `deploy_panel/` (donde está el `package.json` del backend):

```bash
npm install passport passport-google-oauth20 passport-github2 express-session
```

---

## PASO 2 — Crear apps OAuth

### Google
1. Ir a https://console.cloud.google.com/apis/credentials
2. Crear proyecto → "Credenciales" → "Crear credencial" → "ID de cliente OAuth 2.0"
3. Tipo: **Aplicación web**
4. URI de redireccionamiento autorizado: `https://stardest.com/api/auth/google/callback`
5. Guardar el **Client ID** y **Client Secret**

### GitHub
1. Ir a https://github.com/settings/applications/new
2. Application name: `StarDest`
3. Homepage URL: `https://stardest.com`
4. Authorization callback URL: `https://stardest.com/api/auth/github/callback`
5. Guardar el **Client ID** y **Client Secret**

---

## PASO 3 — Variables de entorno en `docker-compose.yml`

En el servicio `deploy_panel`, agregar bajo `environment`:

```yaml
deploy_panel:
  environment:
    - DEPLOYS_DIR=/home/project/deploys
    - SESSION_SECRET=cambia_esto_por_una_cadena_aleatoria_larga
    - GOOGLE_CLIENT_ID=tu_google_client_id
    - GOOGLE_CLIENT_SECRET=tu_google_client_secret
    - GITHUB_CLIENT_ID=tu_github_client_id
    - GITHUB_CLIENT_SECRET=tu_github_client_secret
    - FRONTEND_URL=https://stardest.com
```

---

## PASO 4 — Rutas de autenticación en `index.js`

Agregar este bloque justo después de `app.use(express.static('public'))` y antes de los comentarios de rutas:

```javascript
// ==========================================
// --- AUTENTICACIÓN OAuth ---
// ==========================================
const session    = require('express-session');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,       // HTTPS via Cloudflare
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 días
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Google
passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  'https://stardest.com/api/auth/google/callback',
}, (accessToken, refreshToken, profile, done) => {
    const user = {
        id:       profile.id,
        name:     profile.displayName,
        email:    profile.emails?.[0]?.value,
        avatar:   profile.photos?.[0]?.value,
        provider: 'google',
    };
    return done(null, user);
}));

// GitHub
passport.use(new GitHubStrategy({
    clientID:     process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL:  'https://stardest.com/api/auth/github/callback',
}, (accessToken, refreshToken, profile, done) => {
    const user = {
        id:       profile.id,
        name:     profile.displayName || profile.username,
        email:    profile.emails?.[0]?.value,
        avatar:   profile.photos?.[0]?.value,
        provider: 'github',
        username: profile.username,
    };
    return done(null, user);
}));

// Rutas OAuth
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=1` }),
    (req, res) => res.redirect(`${process.env.FRONTEND_URL}/deploy`)
);

app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:email'] })
);
app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=1` }),
    (req, res) => res.redirect(`${process.env.FRONTEND_URL}/deploy`)
);

// Sesión actual
app.get('/auth/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: req.user });
    } else {
        res.json({ authenticated: false, user: null });
    }
});

// Logout
app.post('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});
```

---

## PASO 5 — Hook `useAuth` en el frontend

Crear el archivo `deploy_panel/apps/web/src/hooks/useAuth.js`:

```javascript
// hooks/useAuth.js
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

---

## PASO 6 — Reemplazar `Login.jsx`

Reemplazar el contenido de `deploy_panel/apps/web/src/pages/Login.jsx` con:

```jsx
// pages/Login.jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const error = params.get('error');

    // Si ya está logueado, redirigir al deploy
    useEffect(() => {
        if (!loading && user) navigate('/deploy');
    }, [user, loading, navigate]);

    if (loading) return null;

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                border: '1px solid rgba(47,74,103,0.5)',
                background: 'rgba(11,15,25,0.95)',
                padding: '40px 32px',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 style={{
                        fontFamily: "'Jersey 10', monospace",
                        fontSize: '28px',
                        color: '#e8eeff',
                        letterSpacing: '0.06em',
                        margin: '0 0 8px',
                    }}>
                        BIENVENIDO
                    </h1>
                    <p style={{
                        fontFamily: "'Jersey 10', monospace",
                        fontSize: '15px',
                        color: 'rgba(200,216,255,0.55)',
                        margin: 0,
                    }}>
                        Inicia sesión para continuar
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        marginBottom: '20px',
                        padding: '12px 16px',
                        border: '1px solid rgba(255,80,80,0.4)',
                        background: 'rgba(255,50,50,0.08)',
                        color: '#ff8080',
                        fontFamily: "'Jersey 10', monospace",
                        fontSize: '14px',
                        textAlign: 'center',
                    }}>
                        Error al iniciar sesión. Intenta de nuevo.
                    </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Google */}
                    <a
                        href="/api/auth/google"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            padding: '14px 20px',
                            border: '1px solid rgba(47,74,103,0.6)',
                            background: 'rgba(15,44,69,0.3)',
                            color: '#e8eeff',
                            textDecoration: 'none',
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '17px',
                            letterSpacing: '0.04em',
                            transition: 'border-color 0.15s, background 0.15s',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                            e.currentTarget.style.background = 'rgba(0,212,255,0.06)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(47,74,103,0.6)';
                            e.currentTarget.style.background = 'rgba(15,44,69,0.3)';
                        }}
                    >
                        <GoogleIcon />
                        Continuar con Google
                    </a>

                    {/* GitHub */}
                    <a
                        href="/api/auth/github"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            padding: '14px 20px',
                            border: '1px solid rgba(47,74,103,0.6)',
                            background: 'rgba(15,44,69,0.3)',
                            color: '#e8eeff',
                            textDecoration: 'none',
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '17px',
                            letterSpacing: '0.04em',
                            transition: 'border-color 0.15s, background 0.15s',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                            e.currentTarget.style.background = 'rgba(0,212,255,0.06)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(47,74,103,0.6)';
                            e.currentTarget.style.background = 'rgba(15,44,69,0.3)';
                        }}
                    >
                        <GitHubIcon />
                        Continuar con GitHub
                    </a>
                </div>

                {/* Footer */}
                <p style={{
                    marginTop: '24px',
                    textAlign: 'center',
                    fontFamily: "'Jersey 10', monospace",
                    fontSize: '13px',
                    color: 'rgba(200,216,255,0.3)',
                }}>
                    Al continuar aceptas los términos de uso
                </p>
            </div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#e8eeff">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
    );
}
```

---

## PASO 7 — Mostrar usuario logueado en el Navbar (opcional)

En `App.jsx`, importar y usar `useAuth` para mostrar el avatar del usuario en lugar del botón LOGIN:

```jsx
// Agregar al inicio de App.jsx
import { useAuth } from './hooks/useAuth';

// Dentro del componente Navbar (o crear un componente UserMenu separado):
function UserMenu() {
    const { user, loading, logout } = useAuth();
    const [open, setOpen] = useState(false);

    if (loading) return null;

    if (!user) {
        return (
            <Link to="/login" style={{ /* estilos existentes del botón LOGIN */ }}>
                LOGIN
            </Link>
        );
    }

    return (
        <div style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px', cursor: 'pointer',
                border: '1px solid rgba(0,212,255,0.3)',
                background: 'rgba(0,212,255,0.06)',
                color: '#e8eeff',
                fontFamily: "'Jersey 10', monospace",
                fontSize: '15px',
            }}>
                {user.avatar && <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                {user.name?.split(' ')[0]}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'rgba(11,15,25,0.97)', border: '1px solid rgba(47,74,103,0.5)',
                    padding: '8px', minWidth: '160px', zIndex: 200,
                }}>
                    <button onClick={logout} style={{
                        width: '100%', padding: '10px 12px', textAlign: 'left',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ff8080', fontFamily: "'Jersey 10', monospace", fontSize: '15px',
                    }}>
                        Cerrar sesión
                    </button>
                </div>
            )}
        </div>
    );
}
```

Reemplazar el `<Link to="/login">LOGIN</Link>` en el Navbar por `<UserMenu />`.

---

## Resumen de archivos a tocar

| Acción | Archivo |
|--------|---------|
| Modificar | `docker-compose.yml` — agregar variables de entorno |
| Modificar | `deploy_panel/apps/builder/index.js` — agregar bloque OAuth |
| Crear | `deploy_panel/apps/web/src/hooks/useAuth.js` |
| Reemplazar | `deploy_panel/apps/web/src/pages/Login.jsx` |
| Modificar | `deploy_panel/apps/web/src/App.jsx` — reemplazar botón LOGIN por `<UserMenu />` |

## Dependencias

```bash
# Backend (en deploy_panel/)
npm install passport passport-google-oauth20 passport-github2 express-session

# Frontend — ninguna nueva (usa fetch nativo)
```

## Flujo completo

```
Usuario hace clic en "Continuar con Google"
    ↓
GET /api/auth/google → Traefik strip /api → backend → redirect a Google
    ↓
Google autentica → callback a /api/auth/google/callback
    ↓
Passport guarda usuario en sesión (cookie)
    ↓
Redirect a https://stardest.com/deploy
    ↓
Frontend llama GET /api/auth/me → recibe { authenticated: true, user: {...} }
    ↓
Navbar muestra avatar + nombre del usuario ✅
```
