const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Traefik/Cloudflare)
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
app.use(cookieParser());
app.use(cors({
    origin: 'https://stardest.com',
    credentials: true
}));

// ==========================================
// --- AUTENTICACIÓN OAuth ---
// ==========================================
const jwt = require('jsonwebtoken');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

app.use(passport.initialize());

// Google
passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID || 'dummy',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'https://stardest.com/api/auth/google/callback',
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
    clientID:     process.env.GITHUB_CLIENT_ID || 'dummy',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'dummy',
    callbackURL:  process.env.GITHUB_CALLBACK_URL || 'https://stardest.com/api/auth/github/callback',
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
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'https://stardest.com'}/login?error=1`, session: false }),
    (req, res) => {
        const token = jwt.sign(req.user, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret', { expiresIn: '7d' });
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.redirect(`${process.env.FRONTEND_URL || 'https://stardest.com'}/dashboard`);
    }
);

app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:email'], session: false })
);
app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: `${process.env.FRONTEND_URL || 'https://stardest.com'}/login?error=1`, session: false }),
    (req, res) => {
        const token = jwt.sign(req.user, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret', { expiresIn: '7d' });
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.redirect(`${process.env.FRONTEND_URL || 'https://stardest.com'}/dashboard`);
    }
);

// Middleware de autenticación centralizado
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret');
        next();
    } catch {
        res.clearCookie('auth_token');
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// Sesión actual
app.get('/auth/me', requireAuth, (req, res) => {
    res.json({ authenticated: true, user: req.user });
});

// Logout
app.post('/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
    });
    res.json({ ok: true });
});

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
async function deployApp(repoUrl, subdomain, branch, userId = 'anonymous', userEmail = 'anonymous') {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const repoPath = path.join(tempDir, subdomain);
    const imageName = `user-app-${subdomain.toLowerCase()}`;

    try {
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

        const hasDockerfile = fs.existsSync(path.join(repoPath, 'Dockerfile'));
        const nextConfigFileNames = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
        const existingNextConfig = nextConfigFileNames.find(f => fs.existsSync(path.join(repoPath, f)));
        const packageJsonPath = path.join(repoPath, 'package.json');

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
        let isNode = fs.existsSync(packageJsonPath);

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

        } else if (isNode) {
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

        console.log(`Limpiando versiones anteriores...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }

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
                "deploy.timestamp": new Date().toISOString(),
                "deploy.userId": userId,
                "deploy.userEmail": userEmail
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
app.post('/deploy', requireAuth, async (req, res) => {
    const { repoUrl, subdomain, branch } = req.body;
    if (!repoUrl || !subdomain) return res.status(400).send("Faltan datos: repoUrl o subdomain");

    const userId = req.user.id || 'anonymous';
    const userEmail = req.user.email || 'anonymous';

    const actualBranch = branch || 'main';
    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch, userId, userEmail);
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

    if (normalizeUrl(repoUrl) === normalizeUrl('https://github.com/lab-capibaras/DeployPanel')) {
        if (pushBranch === 'test' || pushBranch === 'master' || pushBranch === 'main') {
            console.log(`[Webhook] Actualizando DeployPanel automáticamente desde rama: ${pushBranch}`);
            res.status(200).send('Panel actualizando');
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
app.get('/deploys', requireAuth, async (req, res) => {
    try {
        const filterUserId = req.user.id || null;

        const containers = await docker.listContainers({ all: true });
        const deploys = containers
            .filter(c => c.Names.some(name => name.includes('container-')))
            .filter(c => {
                // Si hay usuario autenticado, filtrar por su ID
                if (!filterUserId) return true;
                return c.Labels['deploy.userId'] === filterUserId;
            })
            .map(c => ({
                subdomain: c.Names[0].replace('/container-', ''),
                status: c.State,
                branch: c.Labels['deploy.branch'] || 'unknown',
                repo: c.Labels['deploy.repo'] || 'unknown',
                deployedAt: c.Labels['deploy.timestamp'] || 'unknown',
                userId: c.Labels['deploy.userId'] || 'unknown',
                userEmail: c.Labels['deploy.userEmail'] || 'unknown'
            }));
        res.json({ status: 'success', deploys });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// ==========================================
// --- STATIC SITES ---
// ==========================================
const DEPLOYS_DIR = process.env.DEPLOYS_DIR || path.join(__dirname, '..', '..');
const STATIC_SITES_DIR = path.join(DEPLOYS_DIR, 'static_sites');
const NGINX_CONFIGS_DIR = path.join(DEPLOYS_DIR, 'nginx_configs');
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

// Recarga nginx usando dockerode (no requiere binario docker en el contenedor)
async function reloadNginx() {
    try {
        const container = docker.getContainer('static_server');
        const execInstance = await container.exec({
            Cmd: ['nginx', '-s', 'reload'],
            AttachStdout: true,
            AttachStderr: true,
        });
        await execInstance.start();
        console.log('[Nginx] Recargado OK');
    } catch (err) {
        console.warn('[Nginx] No se pudo recargar:', err.message);
    }
}

// 5a. GET /api/static-projects
app.get('/api/static-projects', (req, res) => {
    const projects = readStaticProjects();
    res.json({ status: 'success', projects });
});

// 5b. POST /api/static-projects
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
        console.warn(`[Static] Webhook no disponible: ${err.message}`);
    }

    res.json({
        status: 'success',
        message: `Sitio '${site}' registrado y deploy iniciado`,
        url: `https://${site}.stardest.com`,
        deployedAt: new Date().toISOString(),
    });
});

// 5c. DELETE /api/static-projects/:site
app.delete('/api/static-projects/:site', async (req, res) => {
    const { site } = req.params;
    const projects = readStaticProjects();
    if (!projects[site]) {
        return res.status(404).json({ status: 'error', message: `Sitio '${site}' no encontrado` });
    }
    delete projects[site];
    writeStaticProjects(projects);

    const siteDir = path.join(STATIC_SITES_DIR, site);
    const confFile = path.join(NGINX_CONFIGS_DIR, `${site}.conf`);
    if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true });
    if (fs.existsSync(confFile)) fs.rmSync(confFile);

    await reloadNginx();
    console.log(`[Static] Proyecto eliminado: ${site}`);
    res.json({ status: 'success', message: `Sitio '${site}' eliminado` });
});

// 5d. POST /deploy/upload — Subida de .zip (drag & drop)
app.post('/deploy/upload', upload.single('file'), async (req, res) => {
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
        if (!fs.existsSync(STATIC_SITES_DIR)) fs.mkdirSync(STATIC_SITES_DIR, { recursive: true });
        if (!fs.existsSync(NGINX_CONFIGS_DIR)) fs.mkdirSync(NGINX_CONFIGS_DIR, { recursive: true });

        const siteDir = path.join(STATIC_SITES_DIR, subdomain);
        if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true });
        fs.mkdirSync(siteDir, { recursive: true });

        console.log(`[Upload] Extrayendo zip para: ${subdomain} (${req.file.size} bytes)`);
        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(siteDir, true);

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

        const defaultConf = path.join(NGINX_CONFIGS_DIR, 'default.conf');
        if (!fs.existsSync(defaultConf)) {
            fs.writeFileSync(defaultConf, `server {\n    listen 80 default_server;\n    server_name _;\n    return 404;\n}\n`);
        }

        const projects = readStaticProjects();
        projects[subdomain] = { repo: 'zip-upload', branch: 'upload', build_cmd: '', output_dir: '' };
        writeStaticProjects(projects);

        await reloadNginx();

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