# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**StarDest** is a PaaS (Platform as a Service) for automated deployment. It features:
- A React 19 + Vite frontend (apps/web) with a pixel art theme and dark/light modes
- A Node.js builder service (apps/builder) that orchestrates Docker-based deployments
- Support for multiple project types: Next.js, Vite/React, Python/FastAPI, and generic Node.js
- i18n support (Spanish/English) with a lightweight DOM-based preference store
- Docker + Traefik integration for containerized app management

## Architecture

### Frontend (apps/web)
- **Framework**: React 19 with React Router v7
- **Build**: Vite with @tailwindcss/vite v4 for styling (no tailwind config file needed)
- **Styling**: Tailwind + custom pixel art CSS with CRT/retro effects, dark mode toggle via `light-mode` class on `<html>`
- **Language State**: Stored in `data-lang` attribute on `<html>`, synced to localStorage
- **Theme State**: Stored in `sd-theme` localStorage, applies `light-mode` class to `<html>`
- **Pages**: Home (landing), Login (form stub), Deploy (main feature with form → confirm → progress → success flow)
- **Key Pattern**: Preferences (theme/lang) use a module-level store (store/prefs.js) that notifies only subscribing components via usePrefs() hook, avoiding unnecessary re-renders
- **Canvas Elements**: Starfield animation (canvas-based, dark/light aware) and PixelIcons (SVG sprite system)
- **Entry**: apps/web/src/main.jsx → App.jsx (router shell) → pages and components

### Backend/Builder (apps/builder)
- **Framework**: Express.js
- **Core Logic**: deployApp() function that:
  1. Clones repo (shallow, branch-specific)
  2. Detects project type (Dockerfile → Next.js → Vite → Python → Node.js → Buildpacks fallback)
  3. Auto-generates Dockerfile if missing
  4. Builds Docker image via dockerode
  5. Cleans up old containers and deploys to Traefik network
- **Persistence**: deployments.json file stores subdomain mappings (repoUrl#branch → subdomain)
- **Integration**: simple-git for git operations, dockerode for Docker API, express for HTTP API
- **API Endpoints**:
  - `POST /deploy` - Manual deployment
  - Additional webhook/polling endpoints (see builder/index.js:440+)

### API (apps/api)
- Currently a shell: src/controllers/, src/routes/, src/services/ are empty (.gitkeep only)
- Reserved for future backend services

### Internationalization (i18n)
- Translation files: i18n/es.js, i18n/en.js (full object with nav, home, login, deploy, validation keys)
- Hook: useTranslation() returns the translation object for current lang
- Storage: localStorage keys are `sd-lang` and `sd-theme`
- CSS-based label switching: `.nav-label-en/.nav-label-es` classes with `html[data-lang="en"]` selectors (no JS re-renders needed for static text)

## Common Commands

### Development
```bash
# Install dependencies (monorepo)
npm install

# Run frontend dev server (Vite hot reload)
npm run dev:web
# → http://localhost:5173

# Run builder service dev
npm run dev:builder
# → http://localhost:4000 (builder API)

# Build frontend for production
npm run build --workspace=apps/web
# Output: apps/web/dist/

# Lint frontend code
npm run lint --workspace=apps/web
```

### Docker & Deployment
```bash
# Start full stack (Postgres, Redis, builder) via docker-compose
docker-compose up

# Run builder directly (without docker-compose)
node apps/builder/index.js
# Starts Express on port 4000, watches for /deploy POST requests
```

### Testing
- No test suite currently configured. Consider adding Jest/Vitest for frontend (React components) and builder (deployment logic).

## Key Implementation Details

### Deploy Page Flow
The Deploy.jsx page is the main feature:
1. **Form Phase**: User enters GitHub URL, selects branch (fetched dynamically), subdomain
2. **Validation**: Subdomain checked against regex pattern `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` (max 40 chars)
3. **Branch Fetching**: parseGithubUrl() extracts owner/repo, then calls backend API to list branches
4. **Confirm Phase**: User reviews settings
5. **Progress Phase**: Real-time log stream from builder (WebSocket or polling)
6. **Success/Error Phase**: Display deployment URL or error message
7. **Toast Notifications**: Auto-dismiss notifications (4.5s timeout)

### Preferences & Performance Optimization
- prefs.js uses a module-level store with listener callbacks (no context API, no Redux)
- Components **must** call usePrefs() hook to subscribe; others won't re-render on theme/lang changes
- CSS-based static text switching via `[data-lang]` attribute on `<html>` for zero JS overhead
- MobileDrawer reads lang directly from DOM attribute to avoid subscription overhead

### Dockerfile Auto-Generation Strategy
The builder intelligently detects project type and generates appropriate Dockerfiles:
- **Next.js**: Multi-stage build, handles standalone output mode
- **Vite/React**: Node build + Nginx runner (serves dist on port 3000 via SPA routing)
- **Python/FastAPI**: Detects FastAPI app, scans for DB dependencies (psycopg2, mysqlclient, etc.) and installs system libs
- **Generic Node.js**: npm start pattern
- **Fallback**: Paketo Buildpacks (CNCF standard, auto-detects runtime)

### Docker Container Labels & Traefik Integration
Each deployed container is labeled for Traefik routing:
- `traefik.http.routers.{subdomain}.rule`: Host-based routing to `{subdomain}.stardest.com`
- `traefik.http.services.{subdomain}.loadbalancer.server.port`: Port 3000 (standard for all apps)
- Custom labels: branch, repo URL, deployment timestamp for auditing

### Styling & Theming
- Tailwind v4 via `@tailwindcss/vite` (CSS-first, no config file required)
- Design tokens defined as CSS custom properties in index.css (--px-bg, --px-blue, --px-cyan, etc.)
- Pixel art aesthetic via custom classes (.px-card, .px-btn, .px-terminal) with step() animations for retro feel
- Dark mode: checks `document.documentElement.classList.contains('light-mode')`; if absent, defaults to dark
- Scanline overlay, CRT glow, marching ants borders, glitch effects all in CSS

## File Structure Summary

```
DeployPanel/
├── apps/
│   ├── web/              # React 19 + Vite frontend
│   │   ├── src/
│   │   │   ├── App.jsx       # Router shell, navbar, preferences
│   │   │   ├── main.jsx      # Entry point
│   │   │   ├── pages/        # Home, Login, Deploy
│   │   │   ├── components/   # Starfield, PixelIcons, PixelRocket
│   │   │   ├── store/        # prefs.js (theme/lang store)
│   │   │   ├── i18n/         # es.js, en.js translations
│   │   │   ├── index.css     # Tailwind + pixel art styles
│   │   │   └── smoothScroll.js
│   │   ├── public/           # Static assets (icons, images, glass-element.js)
│   │   ├── vite.config.js    # Minimal: just tailwindcss + react plugins
│   │   ├── index.html        # Entry HTML
│   │   └── package.json
│   ├── api/              # Empty API shell (reserved)
│   │   └── src/
│   │       ├── controllers/
│   │       ├── routes/
│   │       └── services/
│   └── builder/          # Express builder service
│       ├── index.js      # Main deployment orchestrator (559 lines)
│       └── deployments.json (generated)
├── packages/             # Empty (reserved for shared libs)
├── templates/            # Dockerfile template
├── docker-compose.yml    # Postgres, Redis, builder
├── package.json          # Workspace root (scripts: dev:web, dev:api, dev:builder, start)
└── README.md
```

## Important Notes for Future Development

1. **No Breaking Changes to Preferences Store**: The prefs.js module-level pattern is intentional for performance. Don't migrate to Context or Zustand without profiling the impact on render counts.

2. **Canvas vs DOM**: Starfield uses canvas for performance; PixelIcons uses inline SVG. Canvas is preferred for animated backgrounds; DOM/SVG for interactive UI.

3. **Docker Socket Access**: Builder service requires access to `/var/run/docker.sock`. In production, ensure proper socket permissions or use docker-in-docker.

4. **Builder Stateless**: Deployments.json is the only persistence layer. For production, migrate to a real database (Postgres via apps/api).

5. **Traefik Network**: Containers are deployed to the `deploys_internal_network` Docker network. Ensure Traefik is running and configured to listen on this network.

6. **Port 3000 Standard**: All deployed apps must listen on port 3000. Traefik routes based on Host header to `{subdomain}.stardest.com`.

7. **Language Labels in CSS**: Static text (nav, buttons) uses CSS content and visibility toggling via `[data-lang]` to avoid React re-renders. Dynamic text uses the useTranslation() hook.

8. **Shallow Clone**: Git clones use `--depth 1` for speed. Don't rely on full history for deployments.

9. **TypeScript**: Frontend uses JSX but is not typed. Consider adding TypeScript if extending with complex logic.

10. **No ESLint Config**: Frontend has ESLint installed but no rules configured beyond React plugin defaults. Consider adding a stricter config as the project grows.
