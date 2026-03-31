# DeployPanel

Panel de despliegue automatizado que permite clonar, construir y desplegar aplicaciones desde repositorios de GitHub usando Docker y Traefik como reverse proxy.

## Descripción

DeployPanel es una herramienta similar a Vercel/Netlify que permite desplegar aplicaciones web de forma automática. El sistema:

1. Clona repositorios de GitHub
2. Detecta automáticamente el lenguaje/framework usando Cloud Native Buildpacks
3. Construye la imagen Docker (con Dockerfile nativo o Buildpacks)
4. Despliega el contenedor con configuración automática de Traefik
5. Asigna un subdominio personalizado

## Características

- **Auto-detección de lenguajes**: Soporta múltiples lenguajes sin configuración manual (Node.js, Python, Java, Go, etc.)
- **Docker-in-Docker**: Ejecuta builds dentro de contenedores
- **Integración con Traefik**: Configuración automática de routing HTTP
- **Subdominios personalizados**: Cada deploy obtiene su propio subdominio
- **Interfaz web moderna**: UI profesional con diseño responsive
- **Reemplazo automático**: Las nuevas versiones reemplazan automáticamente las antiguas

## Tecnologías Utilizadas

- **Node.js** - Runtime del servidor
- **Express** - Framework web
- **Dockerode** - API de Docker para Node.js
- **simple-git** - Cliente Git para Node.js
- **Cloud Native Buildpacks** - Auto-detección y build de aplicaciones
- **Traefik** - Reverse proxy y load balancer
- **Docker** - Containerización

## Requisitos Previos

- Docker instalado y corriendo
- Docker Compose (opcional, para orchestración)
- Red de Docker llamada `deploys_internal_network`
- Traefik configurado en la misma red
- Acceso al socket de Docker (`/var/run/docker.sock`)

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/lab-capibaras/DeployPanel.git
cd DeployPanel
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Crear la red de Docker

```bash
docker network create deploys_internal_network
```

### 4. Construir la imagen Docker

```bash
docker build -t deploy-panel .
```

### 5. Ejecutar el contenedor

```bash
docker run -d \
  --name deploy-panel \
  -p 4000:4000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network deploys_internal_network \
  deploy-panel
```

**Nota importante**: El contenedor necesita acceso al socket de Docker para poder crear otros contenedores (Docker-in-Docker).

## Uso

1. Abra su navegador en `http://localhost:4000`
2. Ingrese la URL del repositorio de GitHub (ej: `https://github.com/usuario/mi-app`)
3. Defina un subdominio único (ej: `mi-app`)
4. Haga clic en "Desplegar Aplicación"
5. Espere 1-2 minutos mientras se construye y despliega
6. Acceda a su aplicación en `http://mi-app.stardest.com`

### Ejemplo con API

```bash
curl -X POST http://localhost:4000/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/usuario/mi-app",
    "subdomain": "mi-app"
  }'
```

## Estructura del Proyecto

```
DeployPanel/
├── Dockerfile              # Imagen del panel de despliegue
├── index.js               # Servidor Express con lógica de deploy
├── package.json           # Dependencias del proyecto
├── public/
│   └── index.html        # Interfaz web del panel
└── temp/                 # Directorio temporal para clones (generado)
```

## Funcionamiento

### Flujo de Despliegue

1. **Clonación**: Se clona el repositorio en `./temp/{subdomain}`
2. **Detección**:
   - Si existe `Dockerfile` → Build tradicional de Docker
   - Si no existe → Se usa Buildpacks para auto-detección
3. **Build**: Se construye la imagen con el tag `user-app-{subdomain}`
4. **Limpieza**: Se elimina el contenedor anterior con el mismo subdominio
5. **Deploy**: Se crea y arranca el nuevo contenedor con labels de Traefik
6. **Routing**: Traefik configura automáticamente el routing HTTP

### Buildpacks

Cuando no hay Dockerfile, el sistema usa [Cloud Native Buildpacks](https://buildpacks.io/) que detecta automáticamente:

- Node.js (npm, yarn, pnpm)
- Python (pip, pipenv, poetry)
- Java (Maven, Gradle)
- Go
- Ruby
- PHP
- .NET Core
- Y más...

## Configuración de Traefik

Los contenedores desplegados se configuran automáticamente con las siguientes labels:

```yaml
traefik.enable: true
traefik.http.routers.{subdomain}.rule: Host(`{subdomain}.stardest.com`)
traefik.http.routers.{subdomain}.entrypoints: web
traefik.http.services.{subdomain}.loadbalancer.server.port: 3000
```

**Nota**: Ajuste el dominio `stardest.com` según su configuración.

## Troubleshooting

### El panel no puede conectarse a Docker

Verifique que el socket de Docker esté montado correctamente:
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine ls -l /var/run/docker.sock
```

### Los contenedores no son accesibles

1. Verifique que Traefik esté corriendo en la misma red
2. Revise los logs de Traefik: `docker logs traefik`
3. Verifique las labels del contenedor: `docker inspect container-{subdomain}`

### Buildpacks falla al detectar el lenguaje

Asegúrese de que su proyecto tenga los archivos de configuración necesarios:
- Node.js: `package.json`
- Python: `requirements.txt` o `Pipfile`
- Java: `pom.xml` o `build.gradle`

## Licencia

ISC

## Autor

lab-capibaras

---

Preguntas o problemas: Abra un issue en GitHub.
