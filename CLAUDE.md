# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**StarDest** is a PaaS (Platform as a Service) for automated deployment. It features:
- A React 19 + Vite frontend (`apps/web`) with a pixel art / retro CRT theme and dark/light modes
- A Node.js builder service (`apps/builder`) that orchestrates Docker-based deployments
- Two deploy modes: Git repository clone OR ZIP file drag-and-drop upload
- Auto-provisioned databases (MySQL or Postgres) per deployment with Adminer at `db-{subdomain}.stardest.com`
- OAuth authentication (Google + GitHub) via Passport.js with stateless JWT cookies
- Static file hosting via nginx with auto-generated server configs
- i18n support (Spanish/English)
- Docker + Traefik integration for containerized app management

## Common Commands

```bash
# Install dependencies (monorepo with npm workspaces)
npm install

# Run frontend dev server (Vite hot reload, proxies /api → localhost:4000)
npm run dev:web          # → http://localhost:5173

# Run builder service
npm run dev:builder      # → http://localhost:4000

# Build frontend for production
npm run build --workspace=apps/web   # Output: apps/web/dist/

# Lint frontend
npm run lint --workspace=apps/web

# Start full stack (Postgres, Redis, builder in Docker)
docker-compose up
```

No test suite is currently configured.

## Architecture

### Frontend (apps/web)

- **Framework**: React 19 + React Router v7, ESM (`"type": "module"`)
- **Build**: Vite 8 with `@tailwindcss/vite` v4 (CSS-first, no tailwind config file)
- **Dev proxy**: `/api/*` → `http://localhost:4000` (strips the `/api` prefix) — all `fetch('/api/...')` calls in the browser map to builder routes without that prefix
- **Pages**: Home (landing), Login (OAuth entry), Deploy (two-mode deploy flow), Dashboard (deployment management)
- **Auth state**: `hooks/useAuth.js` — module-level singleton that fires one `GET /api/auth/me` request shared across all components; exposes `{ user, loading, logout }`. The `store/auth.js` is a legacy localStorage stub and is no longer the primary auth source.
- **Prefs state**: `store/prefs.js` — module-level store with listener callbacks for theme/lang; components subscribe via `usePrefs()`. No Context API or Redux.
- **i18n**: `useTranslation()` hook reads from `i18n/es.js` and `i18n/en.js`. Static nav text uses CSS class toggling via `html[data-lang]` selector instead of JS re-renders.
- **Theme**: `light-mode` class on `<html>`; dark is the default (absence of class). Stored in `sd-theme` localStorage key.
- **Lang**: `data-lang` attribute on `<html>`. Stored in `sd-lang` localStorage key.
- **Components**: `Icons.jsx` (SVG icon set), `WebhookInstructions.jsx`, `Starfield` (canvas animation), `PixelRocket`

### Deploy Page Flow (`pages/Deploy.jsx`)

Two modes toggled by the user:

**Git mode** (`mode === 'git'`):
1. Form: GitHub URL → dynamic branch fetch from `/api/github/branches` → subdomain input
2. Confirm → Progress (real-time log polling) → Success/Error
3. Subdomain regex: `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` (max 40 chars)

**Upload mode** (`mode === 'upload'`):
1. Drag-and-drop or file picker for `.zip` (max 200 MB compressed, 500 MB uncompressed)
2. Confirm → Progress → Success/Error
3. Posts to `/api/deploy/upload` with `multipart/form-data`
4. Deploys via nginx static hosting (not Docker containers)

### Backend/Builder (`apps/builder/index.js`, 1461 lines)

Single Express.js file. All routes are prefixed `/auth`, `/api`, `/deploy`, `/github`, or `/webhook` — but note the Vite dev proxy strips the leading `/api` so frontend `fetch('/api/foo')` hits builder route `/foo`.

**Auth system**:
- OAuth via Passport.js (Google + GitHub strategies), `session: false`
- JWT signed with `JWT_SECRET` (7-day expiry), set as `auth_token` httpOnly cookie
- `requireAuth` middleware: reads cookie, verifies JWT

**Core deployment** (`deployApp()` function):
1. Shallow clone repo (`--depth 1`)
2. Detect project type: Dockerfile → Next.js → Vite/React → Python/FastAPI → Node.js → Buildpacks fallback
3. Auto-generate Dockerfile if missing
4. Detect DB needs (`detectDbType()` scans `package.json`, `requirements.txt`, PHP config files)
5. Provision DB container if needed (`provisionDatabase()`)
6. Build Docker image via dockerode, deploy to `deploys_internal_network` Traefik network
7. Set env vars (`DATABASE_URL`, `MYSQLHOST`/`PGHOST`, etc.) on the app container

**Auto-database provisioning** (`provisionDatabase()`):
- Spins up `mysql:8` or `postgres:16-alpine` Docker container named `db-{subdomain}`
- DB credentials stored as Docker container labels (recoverable on redeploy)
- Deploys Adminer at `db-{subdomain}.stardest.com` via Traefik
- Imports any `.sql` files found in the repo root or `database/`/`db/` directories

**Static file hosting**:
- ZIP uploads extracted to `DEPLOYS_DIR/../srv/static/{subdomain}/`
- nginx config auto-generated at `NGINX_CONFIGS_DIR/{subdomain}.conf` with SPA routing
- `reloadNginx()` sends SIGHUP to the running nginx container

**API Endpoints** (all require `requireAuth` unless noted):
| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/google` | OAuth redirect (no auth required) |
| GET | `/auth/github` | OAuth redirect (no auth required) |
| GET | `/auth/me` | Current user from JWT |
| POST | `/auth/logout` | Clear auth cookie |
| POST | `/deploy` | Git-based deployment |
| GET | `/github/branches` | List branches for a GitHub repo |
| POST | `/webhook` | Auto-redeploy on push (no auth) |
| DELETE | `/deploy/:subdomain` | Remove a deployment |
| GET | `/deploys` | List user's deployments |
| GET | `/api/static-projects` | List static projects (no auth) |
| POST | `/api/static-projects` | Register static project |
| DELETE | `/api/static-projects/:site` | Remove static project |
| POST | `/deploy/upload` | ZIP upload deploy (no auth middleware) |

**Persistence**:
- `deployments.json` maps `repoUrl#branch` → subdomain (for deduplication / redeploys)
- `static-projects.json` tracks nginx-hosted static sites
- Docker container labels store DB credentials

**Rate limiting**:
- `/auth/*` routes: 10 requests per 15 minutes
- `/api/*` routes: 100 requests per minute

### Traefik & Networking

- All Docker-deployed apps join `deploys_internal_network`
- Traefik routes `{subdomain}.stardest.com` → container port 3000
- All deployed apps must listen on port 3000
- Adminer containers exposed at `db-{subdomain}.stardest.com` (port 8080 internally)
- IP detection supports Cloudflare (`CF-Connecting-IP` header)

### Dockerfile Auto-Generation

| Detected type | Strategy |
|---------------|----------|
| Next.js | Multi-stage build, handles standalone output mode |
| Vite/React | Node build stage + nginx runner (SPA routing, port 3000) |
| Python/FastAPI | Detects FastAPI app, scans for DB system deps |
| Generic Node.js | `npm start` pattern |
| Fallback | Paketo Buildpacks (CNCF, auto-detects runtime) |

### Styling & Theming

- Tailwind v4 via `@tailwindcss/vite` — no config file, CSS-first
- Design tokens in `index.css` as CSS custom properties (`--px-bg`, `--px-blue`, `--px-cyan`, etc.)
- Pixel art classes: `.px-card`, `.px-btn`, `.px-terminal` with `step()` animations
- Scanline overlay, CRT glow, marching ants borders, glitch effects all in CSS

## Environment Variables

The builder reads these from the environment (no `.env` file — set in shell or docker-compose):

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` / `SESSION_SECRET` | `dev-secret` | JWT signing key |
| `GOOGLE_CLIENT_ID` | `dummy` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | `dummy` | Google OAuth |
| `GOOGLE_CALLBACK_URL` | `https://stardest.com/api/auth/google/callback` | |
| `GITHUB_CLIENT_ID` | `dummy` | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | `dummy` | GitHub OAuth |
| `GITHUB_CALLBACK_URL` | `https://stardest.com/api/auth/github/callback` | |
| `FRONTEND_URL` | `https://stardest.com` | OAuth redirect base |
| `DEPLOYS_DIR` | Two levels above `apps/builder/` | Where repos are cloned |
| `WEBHOOK_URL` | `http://host.docker.internal:9000/hooks/deploy-static` | Webhook service for static builds |

## Key Constraints

- **Prefs store is intentional**: `store/prefs.js` module-level pattern avoids React Context overhead. Don't migrate to Context/Zustand without profiling.
- **Docker socket required**: Builder needs `/var/run/docker.sock`. Ensure socket permissions in production.
- **Port 3000 is mandatory**: All deployed app containers must bind port 3000; Traefik routes based on this.
- **JWT is stateless**: No server-side session. Cookie name is `auth_token`.
- **Shallow clones**: `--depth 1` — don't rely on full git history in deployments.
- **ZIP validation**: Magic bytes checked before extraction to prevent non-ZIP uploads.
- **`store/auth.js` is legacy**: It's a localStorage stub. Real auth flows through `hooks/useAuth.js` which calls `/api/auth/me`.
