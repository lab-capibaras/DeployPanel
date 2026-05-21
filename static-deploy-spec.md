# Especificación: Static Deploy (Netlify-style) para DeployPanel

## Contexto del proyecto

DeployPanel es una plataforma PaaS propia (tipo Vercel/Netlify) que corre en un servidor con Docker.
Repo: https://github.com/lab-capibaras/DeployPanel (rama `test`)

### Stack actual
- **Traefik v2.11** — reverse proxy, enruta por Host/PathPrefix
- **Cloudflared** — túnel hacia Traefik
- **webhook (adnanh/webhook v2.8.0)** — corre en el host en puerto 9000, recibe POST y ejecuta scripts bash
- **deploy_panel** — backend Node.js en puerto 4000, maneja builds de la plataforma
- **web_frontend** — frontend Vite/React, compilado con Dockerfile multistage (node → nginx)
- **node_app / php_app** — servicios de usuario enrutados por subdominio

### Flujo de deploy existente
```
GitHub push → POST /hooks/update-test → webhook → update_web.sh → git pull → docker compose up --build web_frontend
```

---

## Feature a implementar: Static Site Hosting

Permitir desplegar sitios estáticos (HTML/CSS/JS, o apps con build step) bajo subdominios `<site>.stardest.com`, sin crear un contenedor Docker por sitio.

### Arquitectura de la solución

- Un contenedor **`static_server`** (nginx:alpine) sirve todos los sitios estáticos
- Cada sitio vive en `./static_sites/<site-name>/` (volumen montado en el contenedor)
- Cada sitio tiene su config nginx en `./nginx_configs/<site-name>.conf` (también volumen montado)
- Un script **`deploy_static.sh`** maneja: clonar repo → build en Docker → copiar archivos → generar config nginx → recargar nginx
- El registro de proyectos estáticos vive en **`static_projects.json`**
- Un nuevo hook **`deploy-static`** en `hooks.json` activa el script vía POST

---

## Archivos modificados

### `docker-compose.yml`

Cambios:
1. Añadir servicio `static_server`
2. Añadir `priority=10` a los routers de `node_app` y `php_app` (necesario porque el `HostRegexp` del static_server tiene cadena más larga y Traefik le daría mayor prioridad por defecto)

```yaml
services:
  traefik:
    image: traefik:v2.11
    container_name: traefik
    extra_hosts:
      - "host.docker.internal:host-gateway"
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--providers.docker.network=deploys_internal_network"
      - "--providers.file.filename=/traefik_dynamic.yml"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik_dynamic.yml:/traefik_dynamic.yml:ro
    networks:
      - internal_network
    restart: always

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel --no-autoupdate run --token (TOKEN)
    networks:
      - internal_network
    restart: always

  web_frontend:
    build:
      context: ./deploy_panel/apps/web
      dockerfile: Dockerfile
    container_name: stardest_web
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web-router.rule=Host(`stardest.com`)"
      - "traefik.http.routers.web-router.priority=1"
      - "traefik.http.services.web-service.loadbalancer.server.port=80"

  deploy_panel:
    build:
      context: ./deploy_panel
      dockerfile: templates/Dockerfile
    container_name: deploy_panel
    working_dir: /app
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: node apps/builder/index.js
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.panel-api.rule=Host(`stardest.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.panel-api.priority=20"
      - "traefik.http.routers.panel-deploy-post.rule=Host(`stardest.com`) && PathPrefix(`/deploy`) && Method(`POST`)"
      - "traefik.http.routers.panel-deploy-post.priority=25"
      - "traefik.http.services.panel-service.loadbalancer.server.port=4000"
      - "traefik.http.middlewares.api-strip.stripprefix.prefixes=/api"
      - "traefik.http.routers.panel-api.middlewares=api-strip"

  node_app:
    image: node:20-slim
    container_name: node_app
    working_dir: /app
    volumes:
      - ./NodeServer:/app
    command: node index.js
    restart: unless-stopped
    networks:
      - internal_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.node-router.rule=Host(`node.stardest.com`)"
      - "traefik.http.routers.node-router.entrypoints=web"
      - "traefik.http.routers.node-router.priority=10"
      - "traefik.http.services.node-service.loadbalancer.server.port=3000"

  php_app:
    image: php:8.3-apache
    container_name: php_app
    volumes:
      - ./PhpServer:/var/www/html
    restart: unless-stopped
    networks:
      - internal_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.php-router.rule=Host(`php.stardest.com`)"
      - "traefik.http.routers.php-router.entrypoints=web"
      - "traefik.http.routers.php-router.priority=10"
      - "traefik.http.services.php-service.loadbalancer.server.port=80"

  # NUEVO: servidor de sitios estáticos
  static_server:
    image: nginx:alpine
    container_name: static_server
    volumes:
      - ./static_sites:/srv/static:ro
      - ./nginx_configs:/etc/nginx/conf.d:ro
    networks:
      - internal_network
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.static-router.rule=HostRegexp(`{sub:[a-z0-9-]+}.stardest.com`)"
      - "traefik.http.routers.static-router.entrypoints=web"
      - "traefik.http.routers.static-router.priority=2"
      - "traefik.http.services.static-service.loadbalancer.server.port=80"

networks:
  internal_network:
    name: deploys_internal_network
    driver: bridge
```

---

### `hooks.json`

Añadir un segundo hook `deploy-static` que recibe `{"site": "<nombre>"}` en el body del POST y pasa el valor como argumento al script.

```json
[
  {
    "id": "update-test",
    "execute-command": "/home/project/deploys/update_web.sh",
    "command-working-directory": "/home/project/deploys"
  },
  {
    "id": "deploy-static",
    "execute-command": "/home/project/deploys/deploy_static.sh",
    "command-working-directory": "/home/project/deploys",
    "pass-arguments-to-command": [
      {
        "source": "payload",
        "name": "site"
      }
    ]
  }
]
```

---

## Archivos nuevos

### `deploy_static.sh`
Ruta: `/home/project/deploys/deploy_static.sh`
Permisos: `chmod +x deploy_static.sh`

```bash
#!/bin/bash
set -e

SITE_NAME=$1
DEPLOYS_DIR="/home/project/deploys"
PROJECTS_FILE="$DEPLOYS_DIR/static_projects.json"

if [ -z "$SITE_NAME" ]; then
    echo "Error: se requiere el nombre del sitio como primer argumento."
    exit 1
fi

REPO=$(jq -r ".[\"$SITE_NAME\"].repo"                        "$PROJECTS_FILE")
BRANCH=$(jq -r ".[\"$SITE_NAME\"].branch // \"main\""        "$PROJECTS_FILE")
BUILD_CMD=$(jq -r ".[\"$SITE_NAME\"].build_cmd // \"\""      "$PROJECTS_FILE")
OUTPUT_DIR=$(jq -r ".[\"$SITE_NAME\"].output_dir // \"dist\"" "$PROJECTS_FILE")

if [ "$REPO" = "null" ] || [ -z "$REPO" ]; then
    echo "Error: sitio '$SITE_NAME' no encontrado en static_projects.json"
    exit 1
fi

echo "== Desplegando sitio estático: $SITE_NAME =="

TEMP_DIR="/tmp/static_build_$SITE_NAME"
STATIC_OUT="$DEPLOYS_DIR/static_sites/$SITE_NAME"
NGINX_CONF="$DEPLOYS_DIR/nginx_configs/$SITE_NAME.conf"

# 1. Clonar o actualizar repositorio
if [ -d "$TEMP_DIR/.git" ]; then
    echo "Actualizando repo..."
    cd "$TEMP_DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
else
    echo "Clonando repo..."
    rm -rf "$TEMP_DIR"
    git clone --branch "$BRANCH" --depth 1 "$REPO" "$TEMP_DIR"
fi

# 2. Build dentro de un contenedor Docker (no requiere Node en el host)
if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
    echo "Construyendo con: $BUILD_CMD"
    docker run --rm \
        -v "$TEMP_DIR:/app" \
        -w /app \
        node:20-alpine \
        sh -c "npm install --silent && $BUILD_CMD"
    BUILD_SRC="$TEMP_DIR/$OUTPUT_DIR"
else
    BUILD_SRC="$TEMP_DIR"
fi

# 3. Copiar archivos al volumen del static_server
echo "Copiando archivos estáticos..."
mkdir -p "$STATIC_OUT"
rsync -a --delete "$BUILD_SRC/" "$STATIC_OUT/"

# 4. Generar config nginx (solo la primera vez; editar manualmente después si hace falta)
if [ ! -f "$NGINX_CONF" ]; then
    echo "Creando config nginx para $SITE_NAME.stardest.com ..."
    cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $SITE_NAME.stardest.com;
    root /srv/static/$SITE_NAME;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
fi

# 5. Recargar nginx sin downtime
echo "Recargando nginx..."
docker exec static_server nginx -s reload

echo "Deploy completado: http://$SITE_NAME.stardest.com"
```

---

### `static_projects.json`
Ruta: `/home/project/deploys/static_projects.json`

Registro de todos los sitios estáticos. Campos:
- `repo` — URL del repositorio Git (requerido)
- `branch` — rama a desplegar (default: `"main"`)
- `build_cmd` — comando de build, ej. `"npm run build"` (vacío = no build, sirve archivos tal cual)
- `output_dir` — carpeta de salida del build (default: `"dist"`)

```json
{
  "mi-landing": {
    "repo": "https://github.com/tuusuario/mi-landing",
    "branch": "main",
    "build_cmd": "npm run build",
    "output_dir": "dist"
  },
  "docs": {
    "repo": "https://github.com/tuusuario/docs-site",
    "branch": "main",
    "build_cmd": "",
    "output_dir": ""
  }
}
```

---

### `nginx_configs/default.conf`
Ruta: `/home/project/deploys/nginx_configs/default.conf`

Config fallback para el contenedor nginx. Devuelve 404 si ningún `server_name` matchea.

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 404;
}
```

---

## Estructura de directorios nueva

```
/home/project/deploys/
├── nginx_configs/              ← CREAR
│   └── default.conf            ← CREAR
├── static_sites/               ← CREAR (se llena automáticamente al hacer deploy)
├── static_projects.json        ← CREAR
└── deploy_static.sh            ← CREAR
```

Comandos para crear los directorios:
```bash
mkdir -p /home/project/deploys/nginx_configs
mkdir -p /home/project/deploys/static_sites
```

---

## API: Cómo disparar un deploy estático

### Endpoint
```
POST https://stardest.com/hooks/deploy-static
Content-Type: application/json
```

### Body
```json
{ "site": "mi-landing" }
```

### Ejemplo con curl
```bash
curl -X POST https://stardest.com/hooks/deploy-static \
     -H "Content-Type: application/json" \
     -d '{"site": "mi-landing"}'
```

---

## Integración con GitHub Webhooks

Los webhooks de GitHub no permiten customizar el payload, por lo que para conectar un repositorio directamente hay que añadir un hook dedicado por proyecto en `hooks.json`:

```json
{
  "id": "deploy-mi-landing",
  "execute-command": "/home/project/deploys/deploy_static.sh",
  "command-working-directory": "/home/project/deploys",
  "pass-arguments-to-command": [
    { "source": "string", "name": "mi-landing" }
  ]
}
```

El webhook de GitHub se configura con la URL: `https://stardest.com/hooks/deploy-mi-landing`

---

## Flujo completo

```
Usuario hace push a GitHub
        ↓
POST /hooks/deploy-static  (o hook dedicado por proyecto)
        ↓
webhook (host:9000) ejecuta: deploy_static.sh "mi-landing"
        ↓
Lee config de static_projects.json
        ↓
git clone / git reset --hard origin/main
        ↓
docker run node:20-alpine → npm install && npm run build
        ↓
rsync output → ./static_sites/mi-landing/
        ↓
Genera ./nginx_configs/mi-landing.conf (solo primera vez)
        ↓
docker exec static_server nginx -s reload
        ↓
Sitio disponible en: mi-landing.stardest.com ✅
```

---

## Notas para la implementación en el frontend del DeployPanel

El panel web (`web_frontend`) debería proveer una UI para gestionar sitios estáticos. Las operaciones necesarias son:

### Leer proyectos
- **GET** `/api/static-projects` → leer y devolver el contenido de `static_projects.json`

### Crear proyecto
- **POST** `/api/static-projects` con body `{ site, repo, branch, build_cmd, output_dir }`
- Escribe la nueva entrada en `static_projects.json`
- Opcionalmente dispara un primer deploy llamando `deploy_static.sh`

### Eliminar proyecto
- **DELETE** `/api/static-projects/:site`
- Borra la entrada de `static_projects.json`
- Borra `./static_sites/<site>/` y `./nginx_configs/<site>.conf`
- Recarga nginx: `docker exec static_server nginx -s reload`

### Disparar deploy manual
- **POST** `/deploy` (ya existe en el panel) con body `{ site }`
- O llamar directamente al hook: `POST /hooks/deploy-static` con `{ site }`

### Datos a mostrar por sitio
- Nombre del sitio
- URL: `https://<site>.stardest.com`
- Repo y rama
- Build command y output dir
- Estado del último deploy (puede leerse del output del script o de un log separado)
