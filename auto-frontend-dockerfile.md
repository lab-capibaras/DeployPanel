# Instrucciones: Auto-generar Dockerfile para frontends sin contenerizar

## Contexto

`orphan-service-detection.md` solo detecta carpetas huérfanas que **ya tienen** su propio `Dockerfile`. Algunos repos tienen una carpeta `frontend/` con un proyecto Vite/React **plano, sin Dockerfile** — el desarrollador nunca lo contenerizó porque en su flujo local solo corre `npm run dev`.

Esta extensión hace que, si una carpeta huérfana no tiene `Dockerfile` pero sí tiene un `package.json` con Vite, React o Next, StarDest le **genere un Dockerfile automáticamente** (reutilizando la misma plantilla que ya usa el flujo `isVite` para repos en la raíz).

---

## PASO 1 — Agregar función `detectViteLikePackage`

En `deploy_panel/apps/builder/index.js`, agregar antes de `findOrphanServiceDirs`:

```javascript
function detectViteLikePackage(dirPath) {
    const pkgPath = path.join(dirPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!(deps.vite || deps.react || deps['react-dom'] || deps.next || deps.vue);
    } catch (e) {
        return false;
    }
}
```

---

## PASO 2 — Agregar función `generateFrontendDockerfile`

```javascript
function generateFrontendDockerfile(dirPath) {
    const dockerfileContent = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
RUN echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3000
`;

    const dockerfilePath = path.join(dirPath, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfileContent);
    console.log(`[Compose] Dockerfile auto-generado para frontend Vite/React/Next en ${path.basename(dirPath)}/`);
    return dockerfilePath;
}
```

**Nota:** si el proyecto usa un directorio de salida distinto a `dist` (ej. Next.js usa `.next`, Vue con Vite por defecto también usa `dist`), este Dockerfile genérico asume Vite/React clásico. Para Next.js dentro de una subcarpeta se recomienda que el repo tenga su propio Dockerfile — este auto-generador cubre el caso más común (Vite + React/Vue).

---

## PASO 3 — Modificar `findOrphanServiceDirs` para generar el Dockerfile si falta

Reemplazar el cuerpo del `for` dentro de `findOrphanServiceDirs` (de `orphan-service-detection.md`):

```javascript
function findOrphanServiceDirs(repoPath, compose) {
    const usedContexts = getComposeBuildContexts(compose);
    const orphans = [];

    let entries;
    try {
        entries = fs.readdirSync(repoPath, { withFileTypes: true });
    } catch (e) {
        return orphans;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name;

        if (IGNORED_DIRS.has(dirName.toLowerCase())) continue;
        if (usedContexts.has(dirName)) continue;

        const dirFullPath = path.join(repoPath, dirName);
        let dockerfilePath = path.join(dirFullPath, 'Dockerfile');

        if (fs.existsSync(dockerfilePath)) {
            orphans.push({ dirName, dockerfilePath });
            console.log(`[Compose] Carpeta huérfana con Dockerfile encontrada: ${dirName}/`);
            continue;
        }

        // No tiene Dockerfile — verificar si es un proyecto Vite/React/Next sin contenerizar
        if (detectViteLikePackage(dirFullPath)) {
            dockerfilePath = generateFrontendDockerfile(dirFullPath);
            orphans.push({ dirName, dockerfilePath });
            continue;
        }

        // No es candidato válido (ni tiene Dockerfile ni es un proyecto frontend reconocible)
    }

    return orphans;
}
```

---

## PASO 4 — Verificar compatibilidad con `ensureDockerfileCopiesSource`

El Dockerfile auto-generado ya incluye `COPY . .` en el stage `builder` (antes de `RUN npm run build`), así que `ensureDockerfileCopiesSource` (de `auto-copy-dockerfile.md`) lo detectará como "ya copia el código fuente" y **no lo modificará** — no se requiere ningún cambio en esa función, solo confirmar que el orden de ejecución sigue siendo: generar Dockerfile → luego `ensureDockerfileCopiesSource` lo revisa → luego build.

---

## Resultado esperado con el repo `moneyflu2.0`

```
backend/   → tiene Dockerfile propio (PHP + Apache)        → detectado por compose, role: backend
frontend/  → NO tiene Dockerfile, sí tiene package.json
             con "vite" y "react" en dependencies          → Dockerfile auto-generado, role: frontend
```

Flujo:
1. `findAppServices(compose)` → encuentra `backend` (está en el compose)
2. `findOrphanServiceDirs(repoPath, compose)` → revisa `frontend/`:
   - No tiene `Dockerfile` → revisa `package.json` → tiene `vite` + `react` → genera Dockerfile automáticamente
   - Se agrega como huérfano válido
3. `resolveMultiServiceDeploy` clasifica ambos → `{ mode: 'dual', backend, frontend }`
4. `deployDualService` construye ambas imágenes (la del frontend usando el Dockerfile recién generado) y las enruta:
   - `monyf.stardest.com/api/*` → backend PHP
   - `monyf.stardest.com/*` → frontend Vite/React compilado, servido por nginx

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar `detectViteLikePackage` |
| `deploy_panel/apps/builder/index.js` | Agregar `generateFrontendDockerfile` |
| `deploy_panel/apps/builder/index.js` | Modificar `findOrphanServiceDirs` para generar Dockerfile si la carpeta no tiene uno pero sí es un proyecto Vite/React/Next |

## Notas

- Solo se generan Dockerfiles para frontends basados en Vite, React, Next o Vue — si la carpeta huérfana es otro tipo de proyecto (ej. una API Express sin Dockerfile), no se auto-genera nada y simplemente se ignora como candidato (cae de vuelta al modo `single` con solo el backend)
- El Dockerfile generado se escribe **solo en el clone temporal**, nunca se sube al repo original del usuario
- Si el proyecto Vite/React requiere variables de entorno en build-time (ej. `VITE_API_URL`), este Dockerfile genérico no las inyecta automáticamente — quedaría como mejora futura si se necesita
