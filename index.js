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
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const key = `${normalizeUrl(repoUrl)}#${branch}`;
    db[key] = subdomain;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getSubdomain(repoUrl, branch) {
    if (!fs.existsSync(DB_FILE)) return null;
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return db[`${normalizeUrl(repoUrl)}#${branch}`];
}

// ==========================================
// --- FUNCIÓN MAESTRA DE DESPLIEGUE ---
// ==========================================
async function deployApp(repoUrl, subdomain, branch) {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const repoPath = path.join(tempDir, subdomain);
    const imageName = `user-app-${subdomain.toLowerCase()}`;

    // 1. CLONAR
    console.log(`Clonando ${repoUrl}...`);
    if (fs.existsSync(repoPath)) fs.rmSync(repoPath, { recursive: true, force: true });
    
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

    if (!isNextJs && fs.existsSync(packageJsonPath)) {
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
        let hasStandaloneOutput = false;
        if (existingNextConfig) {
            const content = fs.readFileSync(path.join(repoPath, existingNextConfig), 'utf8');
            if (content.includes('standalone')) hasStandaloneOutput = true;
        }

        const needsSwcFix = nextMajor <= 12;
        const nextConfigPath = path.join(repoPath, 'next.config.js');

        if (existingNextConfig && existingNextConfig !== 'next.config.js') {
            fs.renameSync(
                path.join(repoPath, existingNextConfig),
                path.join(repoPath, '_original_' + existingNextConfig)
            );
        }

        let webpackSection = '';
        if (needsSwcFix) {
            webpackSection = `
  webpack(config, options) {
    const { webpack } = options;
    const swc05dir = path.dirname(require.resolve('@swc/helpers/package.json'));
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^@swc\\/helpers\\/_\\/_class_private_field_init$/, path.join(swc05dir, 'esm', '_class_private_field_init.js')),
      new webpack.NormalModuleReplacementPlugin(/^@swc\\/helpers\\/_\\/_class_private_field_get$/, path.join(swc05dir, 'esm', '_class_private_field_get.js')),
      new webpack.NormalModuleReplacementPlugin(/^@swc\\/helpers\\/_\\/_class_private_field_set$/, path.join(swc05dir, 'esm', '_class_private_field_set.js'))
    );
    return config;
  },`;
        }

        const newNextConfig = `const path = require('path');\nmodule.exports = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true },${webpackSection} };`;
        fs.writeFileSync(nextConfigPath, newNextConfig);

        let runnerStage = hasStandaloneOutput 
            ? `FROM node:20-alpine AS runner\nWORKDIR /app\nENV NODE_ENV=production\nENV NEXT_TELEMETRY_DISABLED=1\nCOPY --from=builder /app/public ./public\nCOPY --from=builder /app/.next/standalone ./\nCOPY --from=builder /app/.next/static ./.next/static\nEXPOSE 3000\nENV PORT=3000\nCMD ["node", "server.js"]`
            : `FROM node:20-alpine AS runner\nWORKDIR /app\nENV NODE_ENV=production\nENV NEXT_TELEMETRY_DISABLED=1\nCOPY --from=builder /app/public ./public\nCOPY --from=builder /app/.next ./.next\nCOPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/package.json ./package.json\nEXPOSE 3000\nENV PORT=3000\nCMD ["npm", "start"]`;

        const dockerfile = `FROM node:20-alpine AS deps\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --legacy-peer-deps\nFROM node:20-alpine AS builder\nWORKDIR /app\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY . .\nENV NEXT_TELEMETRY_DISABLED=1\nRUN npm run build\n${runnerStage}\n`;
        fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);

        const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
        await runDockerBuild(stream);

    } else if (isVite) {
        console.log(`Proyecto Vite/React detectado. Generando Dockerfile con Nginx...`);

        const dockerfile = `FROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --legacy-peer-deps && npm install react-is --legacy-peer-deps\nCOPY . .\nRUN npm run build\nFROM nginx:alpine\nRUN echo 'server { listen 3000; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf\nCOPY --from=builder /app/dist /usr/share/nginx/html\nEXPOSE 3000\n`;
        fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);

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
        }

        const reqRelativePath = path.relative(repoPath, requirementsPath).replace(/\\/g, '/');
        const dockerfile = `FROM python:3.11-slim\nWORKDIR /app\n${aptGetCommand}COPY ${reqRelativePath} ./requirements.txt\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 3000\nCMD ["uvicorn", "${uvicornModule}", "--host", "0.0.0.0", "--port", "3000"]\n`;
        fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
        
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
                if (error) return reject(new Error(`Fallo Buildpacks: ${stderr || error.message}`));
                resolve();
            });
            packProcess.stdout.pipe(process.stdout);
            packProcess.stderr.pipe(process.stderr);
        });
    }

    // 4. LIMPIEZA DE CONTENEDOR ANTERIOR
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
            // --- VINCULACIÓN DE RAMA Y DATOS AL CONTENEDOR ---
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
}

// ==========================================
// --- RUTAS DE LA API ---
// ==========================================

// 1. DESPLIEGUE MANUAL (Desde tu web)
app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain, branch } = req.body;

    if (!repoUrl || !subdomain) {
        return res.status(400).send("Faltan datos: repoUrl o subdomain");
    }

    const actualBranch = branch || 'main'; // Rama por defecto

    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch);
        
        // Guardar en la "memoria" del webhook para actualizaciones futuras
        saveDeployment(repoUrl, actualBranch, subdomain);

        res.json({
            status: 'success',
            url: url,
            message: 'Aplicación desplegada exitosamente',
            branch: actualBranch,
            deployedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("Error durante el despliegue:", error.message);
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// 2. WEBHOOK AUTOMÁTICO (Desde GitHub)
app.post('/webhook', async (req, res) => {
    const payload = req.body;

    // A) Responder al "ping" inicial de configuración de GitHub
    if (payload.zen) {
        return res.status(200).send('Ping recibido. Webhook conectado a DeployPanel.');
    }

    // B) Validar que la petición tenga datos del repositorio y la rama
    if (!payload.repository || !payload.ref) {
        return res.status(400).send('Payload ignorado (no es un push a una rama)');
    }

    const repoUrl = payload.repository.html_url; 
    const pushBranch = payload.ref.replace('refs/heads/', ''); 

    // --- MAGIA 1: AUTO-ACTUALIZACIÓN DEL PROPIO DEPLOYPANEL ---
    if (normalizeUrl(repoUrl) === normalizeUrl('https://github.com/lab-capibaras/DeployPanel')) {
        if (pushBranch === 'main' || pushBranch === 'master') {
            console.log(`\n[Webhook 🚀] ¡Actualización del código fuente del DeployPanel detectada!`);
            res.status(200).send('Actualizando DeployPanel en el servidor...');
            
            exec('git pull', (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Panel Error] Fallo al actualizar el panel: ${error.message}`);
                    return;
                }
                console.log(`[Panel] Código actualizado correctamente. Reiniciando el servidor en 2 segundos...`);
                setTimeout(() => {
                    process.exit(0); // PM2 o Docker reiniciarán automáticamente el script tras cerrarse
                }, 2000);
            });
        } else {
            res.status(200).send('Ignorado: push en rama no principal del panel.');
        }
        return; // Salir aquí para no seguir con los despliegues de usuario
    }

    // --- MAGIA 2: AUTO-ACTUALIZACIÓN DE APPS DE USUARIOS ---
    // Buscar si tenemos el repositorio y rama registrados en nuestra base local
    const subdomain = getSubdomain(repoUrl, pushBranch);

    if (!subdomain) {
        console.log(`[Webhook] Ignorado: El repo ${repoUrl} (Rama: ${pushBranch}) no está registrado.`);
        return res.status(200).send('Ignorado, no está registrado en la memoria de despliegues');
    }

    console.log(`\n[Webhook 🚀] ¡Nuevos cambios detectados! Actualizando automáticamente ${subdomain}.stardest.com...`);
    
    // Le respondemos de inmediato a GitHub para evitar un error de "Timeout" (máx 10 seg)
    res.status(200).send('Despliegue automático iniciado en segundo plano');

    // Ejecutamos el despliegue silenciosamente
    try {
        await deployApp(repoUrl, subdomain, pushBranch);
        console.log(`[Webhook ✅] Auto-despliegue de ${subdomain} completado con éxito.`);
    } catch (error) {
        console.error(`[Webhook ❌] Error al auto-actualizar ${subdomain}:`, error.message);
    }
});

// 3. RUTA PARA BORRAR CONTENEDORES
app.delete('/deploy/:subdomain', async (req, res) => {
    const { subdomain } = req.params;

    if (!subdomain) {
        return res.status(400).json({ status: 'error', message: "Falta el subdominio" });
    }

    try {
        console.log(`Solicitud para eliminar el proyecto: ${subdomain}`);
        
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        
        if (existing) {
            const container = docker.getContainer(existing.Id);
            await container.remove({ force: true });
            console.log(`Contenedor container-${subdomain} eliminado.`);
            res.json({ status: 'success', message: `El proyecto ${subdomain} ha sido eliminado correctamente.` });
        } else {
            res.status(404).json({ status: 'warning', message: `No se encontró ningún proyecto corriendo en ${subdomain}.` });
        }
    } catch (error) {
        console.error("Error al eliminar:", error.message);
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// 4. RUTA PARA CONSULTAR DESPLIEGUES ACTIVOS
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
                deployedAt: c.Labels['deploy.timestamp'] || 'unknown',
                image: c.Image
            }));

        res.json({ status: 'success', deploys });
    } catch (error) {
        console.error("Error al listar despliegues:", error.message);
        res.status(500).json({ status: 'error', details: error.message });
    }
});

app.listen(4000, () => console.log("Panel PRO con Auto-Actualización (Vercel Style) en puerto 4000"));