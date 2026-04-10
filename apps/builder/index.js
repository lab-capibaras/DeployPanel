const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

app.listen(4000, () => console.log("Panel PRO (Vercel Style) de 445 líneas en puerto 4000"));