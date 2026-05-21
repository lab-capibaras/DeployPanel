const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Multer: guarda el zip en memoria para procesarlo con adm-zip
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB máximo
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se aceptan archivos .zip'), false);
        }
    },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const uploadStatic = require('./upload-static');
app.use(uploadStatic);


// ==========================================
// --- SISTEMA DE MEMORIA PARA WEBHOOKS ---
// ==========================================
const DB_FILE = path.join(__dirname, 'deployments.json');

function normalizeUrl(url) {
    return url.trim().replace(/\.git$/, '').toLowerCase();
}

function saveDeployment(repoUrl, branch, subdomain) {
    let db = {};
    if (fs.existsSync(DB_FILE)) {
        try {
            db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error("Error leyendo DB_FILE:", e.message);
            db = {};
        }
    }
    const key = `${normalizeUrl(repoUrl)}#${branch}`;
    db[key] = subdomain;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log(`[DB] Registro guardado: ${key} -> ${subdomain}`);
}

function getSubdomain(repoUrl, branch) {
    if (!fs.existsSync(DB_FILE)) return null;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const key = `${normalizeUrl(repoUrl)}#${branch}`;
        return db[key] || null;
    } catch (e) {
        console.error("Error consultando DB_FILE:", e.message);
        return null;
    }
}

// ==========================================
// --- FUNCIÓN MAESTRA DE DESPLIEGUE ---
// ==========================================
async function deployApp(repoUrl, subdomain, branch) {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const repoPath = path.join(tempDir, subdomain);
    const imageName = `user-app-${subdomain.toLowerCase()}`;

    try {
        // 1. CLONAR
        console.log(`-------------------------------------------`);
        console.log(`Iniciando despliegue para: ${subdomain}`);
        console.log(`Repositorio: ${repoUrl}`);
        console.log(`Rama: ${branch || 'default'}`);
        console.log(`-------------------------------------------`);

        console.log(`Clonando ${repoUrl}...`);
        if (fs.existsSync(repoPath)) {
            console.log(`Limpiando directorio temporal anterior...`);
            fs.rmSync(repoPath, { recursive: true, force: true });
        }
        
        const cloneOptions = ['--depth', '1'];
        if (branch) {
            cloneOptions.push('--branch', branch);
            console.log(`Descargando la rama específica: ${branch}`);
        } else {
            console.log(`Descargando la rama por defecto (main/master)`);
        }

        await git.clone(repoUrl, repoPath, cloneOptions);

        // 2. DETECTAR TIPO DE PROYECTO
        const hasDockerfile = fs.existsSync(path.join(repoPath, 'Dockerfile'));

        const nextConfigFileNames = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
        const existingNextConfig = nextConfigFileNames.find(f => fs.existsSync(path.join(repoPath, f)));

        const packageJsonPath = path.join(repoPath, 'package.json');
        
        // --- Buscar requirements.txt en la raíz y subcarpetas comunes ---
        const possibleReqPaths = [
            path.join(repoPath, 'requirements.txt'),
            path.join(repoPath, 'app', 'requirements.txt'),
            path.join(repoPath, 'backend', 'requirements.txt'),
            path.join(repoPath, 'api', 'requirements.txt')
        ];
        const requirementsPath = possibleReqPaths.find(p => fs.existsSync(p));

        let isNextJs = !!existingNextConfig;
        let isVite = false;
        let isPython = !!requirementsPath; 
        let isNode = fs.existsSync(packageJsonPath); // <--- NUEVA DETECCIÓN

        if (!isNextJs && isNode) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                isNextJs = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
                isVite = !!(pkg.dependencies?.vite || pkg.devDependencies?.vite);
            } catch (e) {
                console.warn('No se pudo leer package.json:', e.message);
            }
        }

        const getNextVersion = (pkgPath) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                const ver = pkg.dependencies?.next || pkg.devDependencies?.next || '';
                const match = ver.match(/(\d+)/);
                return match ? parseInt(match[1]) : 13;
            } catch {
                return 13;
            }
        };

        const runDockerBuild = (stream) => new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, outputRes) => {
                if (err) return reject(err);
                outputRes.forEach(line => {
                    if (line.stream) process.stdout.write(line.stream);
                    if (line.error) process.stderr.write(line.error);
                });
                const errorLine = outputRes.find(l => l.error);
                if (errorLine) {
                    return reject(new Error(`Docker build falló: ${errorLine.error.trim()}`));
                }
                resolve(outputRes);
            });
        });

        // 3. ESTRATEGIA DE BUILD
        if (hasDockerfile) {
            console.log(`Dockerfile detectado. Usando build tradicional...`);
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (isNextJs) {
            console.log(`Proyecto Next.js detectado. Generando Dockerfile optimizado...`);

            const nextMajor = getNextVersion(packageJsonPath);
            console.log(`Versión de Next.js detectada: ${nextMajor}.x`);

            let hasStandaloneOutput = false;
            if (existingNextConfig) {
                const content = fs.readFileSync(path.join(repoPath, existingNextConfig), 'utf8');
                if (content.includes('standalone')) {
                    hasStandaloneOutput = true;
                    console.log("Configuración standalone detectada en next.config");
                }
            }

            const needsSwcFix = nextMajor <= 12;
            const nextConfigPath = path.join(repoPath, 'next.config.js');

            if (existingNextConfig && existingNextConfig !== 'next.config.js') {
                fs.renameSync(
                    path.join(repoPath, existingNextConfig),
                    path.join(repoPath, '_original_' + existingNextConfig)
                );
                console.log(`${existingNextConfig} renombrado para evitar conflicto`);
            }

            let webpackSection = '';
            if (needsSwcFix) {
                webpackSection = `
  webpack(config, options) {
    const { webpack } = options;
    const swc05dir = path.dirname(require.resolve('@swc/helpers/package.json'));
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^@swc\\/helpers\\/_\\/_class_private_field_init$/,
        path.join(swc05dir, 'esm', '_class_private_field_init.js')
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^@swc\\/helpers\\/_\\/_class_private_field_get$/,
        path.join(swc05dir, 'esm', '_class_private_field_get.js')
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^@swc\\/helpers\\/_\\/_class_private_field_set$/,
        path.join(swc05dir, 'esm', '_class_private_field_set.js')
      )
    );
    return config;
  },`;
                console.log('Aplicando fix de @swc/helpers para Next.js 12');
            }

            const newNextConfig = `const path = require('path');

/** @type {import('next').NextConfig} */
module.exports = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },${webpackSection}
};
`;
            fs.writeFileSync(nextConfigPath, newNextConfig);
            console.log('next.config.js generado (typescript y eslint errors ignorados)');

            let runnerStage;
            if (hasStandaloneOutput) {
                runnerStage = `FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]`;
            } else {
                runnerStage = `FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]`;
            }

            const dockerfile = `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

${runnerStage}
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log(`Dockerfile generado (modo: ${hasStandaloneOutput ? 'standalone' : 'npm start'})`);

            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (isVite) {
            console.log(`Proyecto Vite/React detectado. Generando Dockerfile con Nginx...`);

            const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install react-is --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
RUN echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3000
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile de Nginx generado exitosamente.');

            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (isPython) {
            console.log(`Proyecto Python detectado. Escaneando código y dependencias...`);

            const reqContent = fs.readFileSync(requirementsPath, 'utf8').toLowerCase();
            let linuxDeps = [];
            if (reqContent.includes('pyodbc')) linuxDeps.push('unixodbc', 'unixodbc-dev', 'g++');
            if (reqContent.includes('psycopg2')) linuxDeps.push('libpq-dev', 'gcc');
            if (reqContent.includes('mysqlclient')) linuxDeps.push('default-libmysqlclient-dev', 'gcc');

            let aptGetCommand = "";
            if (linuxDeps.length > 0) {
                const uniqueDeps = [...new Set(linuxDeps)].join(' ');
                aptGetCommand = `RUN apt-get update && apt-get install -y ${uniqueDeps} && rm -rf /var/lib/apt/lists/*\n`;
                console.log(`Bases de datos detectadas. Se instalarán: ${uniqueDeps}`);
            }

            function findFastAPIApp(dir) {
                let results = [];
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat && stat.isDirectory()) {
                        if (!['node_modules', '.git', 'venv', '__pycache__'].includes(file)) {
                            results = results.concat(findFastAPIApp(filePath));
                        }
                    } else if (file.endsWith('.py')) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const match = content.match(/([a-zA-Z0-9_]+)\s*=\s*FastAPI\(/);
                        if (match) results.push({ filePath, appName: match[1] });
                    }
                }
                return results;
            }

            const fastApiApps = findFastAPIApp(repoPath);
            let uvicornModule = "main:app"; 

            if (fastApiApps.length > 0) {
                const appDef = fastApiApps[0]; 
                const relPath = path.relative(repoPath, appDef.filePath);
                const parsedPath = path.parse(relPath);
                let modulePath = parsedPath.dir ? `${parsedPath.dir.replace(/\\/g, '/').replace(/\//g, '.')}.${parsedPath.name}` : parsedPath.name;
                uvicornModule = `${modulePath}:${appDef.appName}`;
                console.log(`¡EXITO! FastAPI encontrado en: ${relPath}`);
            }

            const reqRelativePath = path.relative(repoPath, requirementsPath).replace(/\\/g, '/');

            const dockerfile = `FROM python:3.11-slim
WORKDIR /app
${aptGetCommand}COPY ${reqRelativePath} ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["uvicorn", "${uvicornModule}", "--host", "0.0.0.0", "--port", "3000"]
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile de Python/FastAPI generado exitosamente.');

            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (isNode) { // <--- BLOQUE AGREGADO PARA NODE.JS ESTÁNDAR
            console.log(`Proyecto Node.js detectado. Generando Dockerfile estándar...`);

            const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile para Node.js generado exitosamente.');

            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else {
            console.log(`No hay Dockerfile, Next.js, Vite ni Python. Usando Buildpacks...`);
            const absoluteRepoPath = path.resolve(repoPath);
            const containerId = os.hostname();

            const packCommand = `docker run --rm \
                -v /var/run/docker.sock:/var/run/docker.sock \
                --volumes-from ${containerId} \
                -w "${absoluteRepoPath}" \
                -e DOCKER_API_VERSION=1.44 \
                -e PORT=3000 \
                -e NODE_ENV=production \
                -e NODE_OPTIONS="--max-old-space-size=2048" \
                buildpacksio/pack:latest \
                build "${imageName}" \
                --builder paketobuildpacks/builder-jammy-base`;

            await new Promise((resolve, reject) => {
                const packProcess = exec(packCommand, (error, stdout, stderr) => {
                    if (error) {
                        console.log("--- ERROR DETALLADO DE BUILDPACKS ---");
                        console.log(stdout);
                        console.log(stderr);
                        return reject(new Error(`Fallo Buildpacks: ${stderr || error.message}`));
                    }
                    resolve();
                });
                packProcess.stdout.pipe(process.stdout);
                packProcess.stderr.pipe(process.stderr);
            });
        }

        // 4. LIMPIEZA
        console.log(`Limpiando versiones anteriores...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }

        // 5. DEPLOY
        console.log(`Lanzando contenedor en la red de Traefik...`);

        const container = await docker.createContainer({
            Image: imageName,
            name: `container-${subdomain}`,
            Labels: {
                "traefik.enable": "true",
                [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
                [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
                [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000",
                "deploy.branch": branch || "main",
                "deploy.repo": repoUrl,
                "deploy.timestamp": new Date().toISOString()
            },
            HostConfig: {
                NetworkMode: "deploys_internal_network",
                RestartPolicy: { Name: "always" },
                Privileged: true
            }
        });

        await container.start();
        console.log(`✓ Despliegue exitoso: ${subdomain}.stardest.com`);
        return `http://${subdomain}.stardest.com`;

    } catch (error) {
        console.error("Error durante el despliegue:", error.message);
        throw error;
    }
}

// ==========================================
// --- RUTAS DE LA API ---
// ==========================================

// 1. Despliegue Manual
app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain, branch } = req.body;
    if (!repoUrl || !subdomain) return res.status(400).send("Faltan datos: repoUrl o subdomain");

    const actualBranch = branch || 'main';

    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch);
        saveDeployment(repoUrl, actualBranch, subdomain);
        res.json({
            status: 'success',
            url: url,
            message: 'Aplicación desplegada exitosamente',
            branch: actualBranch,
            deployedAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// 2. Webhook Automático (Vercel Style)
app.post('/webhook', async (req, res) => {
    const payload = req.body;
    console.log(`[Webhook] Petición recibida de GitHub`);

    if (payload.zen) {
        return res.status(200).send('Ping recibido OK');
    }

    if (!payload.repository || !payload.ref) {
        return res.status(400).send('Payload incompleto');
    }

    const repoUrl = payload.repository.html_url; 
    const pushBranch = payload.ref.replace('refs/heads/', ''); 

    // --- AUTO-ACTUALIZACIÓN DEL PROPIO PANEL ---
    if (normalizeUrl(repoUrl) === normalizeUrl('https://github.com/lab-capibaras/DeployPanel')) {
        // ACTUALIZADO: Ahora reconoce la rama 'test' además de 'master' o 'main'
        if (pushBranch === 'test' || pushBranch === 'master' || pushBranch === 'main') {
            console.log(`[Webhook] Actualizando DeployPanel automáticamente desde rama: ${pushBranch}`);
            res.status(200).send('Panel actualizando');
            
            // AUTOMATIZACIÓN: Pull + Reconstrucción automática de Panel y Web Frontend
            const updateCommand = `git pull origin ${pushBranch} && npm install && docker compose up -d --build deploy_panel web_frontend`;

            exec(updateCommand, (error) => {
                if (error) return console.error(`Error actualizando panel: ${error.message}`);
                console.log(`Panel y Frontend actualizados con éxito. Reiniciando proceso...`);
                setTimeout(() => process.exit(0), 2000);
            });
        } else {
            res.status(200).send('Push en rama secundaria del panel ignorado');
        }
        return;
    }

    // --- AUTO-ACTUALIZACIÓN DE USUARIOS ---
    const subdomain = getSubdomain(repoUrl, pushBranch);

    if (!subdomain) {
        console.log(`[Webhook] Repo ${repoUrl} en rama ${pushBranch} no registrado en memoria.`);
        return res.status(200).send('No registrado');
    }

    console.log(`[Webhook] Cambios detectados para ${subdomain}. Actualizando...`);
    res.status(200).send('Actualización iniciada');

    try {
        await deployApp(repoUrl, subdomain, pushBranch);
        console.log(`[Webhook] ${subdomain} actualizado con éxito.`);
    } catch (error) {
        console.error(`[Webhook] Error actualizando ${subdomain}:`, error.message);
    }
});

// 3. Borrar Proyecto
app.delete('/deploy/:subdomain', async (req, res) => {
    const { subdomain } = req.params;
    if (!subdomain) return res.status(400).json({ status: 'error', message: "Falta el subdominio" });

    try {
        console.log(`Solicitud para eliminar el proyecto: ${subdomain}`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
            console.log(`Contenedor container-${subdomain} eliminado.`);
            res.json({ status: 'success', message: `Proyecto ${subdomain} eliminado correctamente.` });
        } else {
            res.status(404).json({ status: 'warning', message: `No se encontró el proyecto.` });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// 4. Consultar Despliegues
app.get('/deploys', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const deploys = containers
            .filter(c => c.Names.some(name => name.includes('container-')))
            .map(c => ({
                subdomain: c.Names[0].replace('/container-', ''),
                status: c.State,
                branch: c.Labels['deploy.branch'] || 'unknown',
                repo: c.Labels['deploy.repo'] || 'unknown',
                deployedAt: c.Labels['deploy.timestamp'] || 'unknown'
            }));
        res.json({ status: 'success', deploys });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// ==========================================
// --- STATIC SITES (archivo spec: static-deploy-spec.md) ---
// ==========================================
// Rutas base de la infraestructura (dentro del contenedor deploy_panel)
const DEPLOYS_DIR = process.env.DEPLOYS_DIR || path.join(__dirname, '..', '..'); // /home/project/deploys en prod
const STATIC_SITES_DIR   = path.join(DEPLOYS_DIR, 'static_sites');
const NGINX_CONFIGS_DIR  = path.join(DEPLOYS_DIR, 'nginx_configs');
const STATIC_PROJECTS_FILE = path.join(DEPLOYS_DIR, 'static_projects.json');
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://host.docker.internal:9000/hooks/deploy-static';

function readStaticProjects() {
    if (!fs.existsSync(STATIC_PROJECTS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(STATIC_PROJECTS_FILE, 'utf8')); }
    catch (e) { return {}; }
}

function writeStaticProjects(data) {
    fs.writeFileSync(STATIC_PROJECTS_FILE, JSON.stringify(data, null, 2));
}

// 5a. GET /api/static-projects — Lista todos los sitios estáticos registrados
app.get('/api/static-projects', (req, res) => {
    const projects = readStaticProjects();
    res.json({ status: 'success', projects });
});

// 5b. POST /api/static-projects — Registrar un sitio estático y disparar primer deploy
app.post('/api/static-projects', async (req, res) => {
    const { site, repo, branch = 'main', build_cmd = '', output_dir = 'dist' } = req.body;

    if (!site || !repo) {
        return res.status(400).json({ status: 'error', message: 'Faltan campos: site y repo son obligatorios' });
    }
    const siteRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!siteRegex.test(site) || site.length > 40) {
        return res.status(400).json({ status: 'error', message: 'Nombre de sitio inválido' });
    }

    const projects = readStaticProjects();
    projects[site] = { repo, branch, build_cmd, output_dir };
    writeStaticProjects(projects);
    console.log(`[Static] Proyecto registrado: ${site} → ${repo}`);

    // Disparar deploy via webhook (adnanh/webhook)
    try {
        const http = require('http');
        const body = JSON.stringify({ site });
        const url = new URL(WEBHOOK_URL);
        await new Promise((resolve, reject) => {
            const reqHook = http.request({
                hostname: url.hostname,
                port: url.port || 9000,
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            }, (r) => { r.resume(); resolve(r.statusCode); });
            reqHook.on('error', reject);
            reqHook.write(body);
            reqHook.end();
        });
        console.log(`[Static] Webhook disparado para: ${site}`);
    } catch (err) {
        console.warn(`[Static] Webhook no disponible (local?): ${err.message}`);
    }

    res.json({
        status: 'success',
        message: `Sitio '${site}' registrado y deploy iniciado`,
        url: `https://${site}.stardest.com`,
        deployedAt: new Date().toISOString(),
    });
});

// 5c. DELETE /api/static-projects/:site — Eliminar sitio estático
app.delete('/api/static-projects/:site', (req, res) => {
    const { site } = req.params;
    const projects = readStaticProjects();

    if (!projects[site]) {
        return res.status(404).json({ status: 'error', message: `Sitio '${site}' no encontrado` });
    }

    delete projects[site];
    writeStaticProjects(projects);

    // Borrar archivos del sitio
    const siteDir  = path.join(STATIC_SITES_DIR, site);
    const confFile = path.join(NGINX_CONFIGS_DIR, `${site}.conf`);
    if (fs.existsSync(siteDir))  fs.rmSync(siteDir, { recursive: true, force: true });
    if (fs.existsSync(confFile)) fs.rmSync(confFile);

    // Recargar nginx
    exec('docker exec static_server nginx -s reload', (err) => {
        if (err) console.warn(`[Static] nginx reload warning: ${err.message}`);
    });

    console.log(`[Static] Proyecto eliminado: ${site}`);
    res.json({ status: 'success', message: `Sitio '${site}' eliminado` });
});

// 5d. POST /deploy/upload — Subida de .zip → extrae directo al static_server (sin Docker por sitio)
app.post('/deploy/upload', upload.single('file'), (req, res) => {
    const { subdomain } = req.body;

    if (!subdomain) {
        return res.status(400).json({ status: 'error', message: 'Falta el subdominio' });
    }
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No se recibió ningún archivo .zip' });
    }
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!subdomainRegex.test(subdomain) || subdomain.length > 40) {
        return res.status(400).json({ status: 'error', message: 'Subdominio inválido' });
    }

    try {
        // 1. Asegurar directorios
        if (!fs.existsSync(STATIC_SITES_DIR))  fs.mkdirSync(STATIC_SITES_DIR, { recursive: true });
        if (!fs.existsSync(NGINX_CONFIGS_DIR)) fs.mkdirSync(NGINX_CONFIGS_DIR, { recursive: true });

        const siteDir = path.join(STATIC_SITES_DIR, subdomain);
        if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true });
        fs.mkdirSync(siteDir, { recursive: true });

        // 2. Extraer ZIP
        console.log(`[Upload] Extrayendo zip para: ${subdomain} (${req.file.size} bytes)`);
        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(siteDir, true);

        // Si el zip tiene una sola carpeta raíz, mover su contenido hacia arriba
        const entries = fs.readdirSync(siteDir);
        if (entries.length === 1) {
            const singleEntry = path.join(siteDir, entries[0]);
            if (fs.statSync(singleEntry).isDirectory()) {
                console.log(`[Upload] Carpeta raíz detectada: ${entries[0]} — aplanando estructura`);
                const subEntries = fs.readdirSync(singleEntry);
                for (const f of subEntries) {
                    fs.renameSync(path.join(singleEntry, f), path.join(siteDir, f));
                }
                fs.rmSync(singleEntry, { recursive: true, force: true });
            }
        }
        console.log(`[Upload] Archivos extraídos en: ${siteDir}`);

        // 3. Generar config nginx (solo si no existe)
        const confFile = path.join(NGINX_CONFIGS_DIR, `${subdomain}.conf`);
        if (!fs.existsSync(confFile)) {
            const nginxConf = `server {
    listen 80;
    server_name ${subdomain}.stardest.com;
    root /srv/static/${subdomain};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
`;
            fs.writeFileSync(confFile, nginxConf);
            console.log(`[Upload] Config nginx generada: ${confFile}`);
        }

        // 4. Asegurar default.conf fallback
        const defaultConf = path.join(NGINX_CONFIGS_DIR, 'default.conf');
        if (!fs.existsSync(defaultConf)) {
            fs.writeFileSync(defaultConf, `server {\n    listen 80 default_server;\n    server_name _;\n    return 404;\n}\n`);
        }

        // 5. Registrar en static_projects.json
        const projects = readStaticProjects();
        projects[subdomain] = { repo: 'zip-upload', branch: 'upload', build_cmd: '', output_dir: '' };
        writeStaticProjects(projects);

        // 6. Recargar nginx (sin downtime)
        exec('docker exec static_server nginx -s reload', (err) => {
            if (err) console.warn(`[Upload] nginx reload warning: ${err.message}`);
            else console.log(`[Upload] nginx recargado OK`);
        });

        console.log(`[Upload] ✓ Despliegue exitoso: ${subdomain}.stardest.com`);
        res.json({
            status: 'success',
            url: `https://${subdomain}.stardest.com`,
            message: 'Archivo desplegado exitosamente',
            deployedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Upload] Error durante el despliegue:', error.message);
        res.status(500).json({ status: 'error', details: error.message });
    }
});

app.listen(4000, () => console.log("Panel PRO (Vercel Style) en puerto 4000"));