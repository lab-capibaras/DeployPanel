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
const rateLimit = require('express-rate-limit');
const pino = require('pino');

const logger = pino({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' }
    }
});

// Cloudflare envía la IP real en el header CF-Connecting-IP
const getIP = (req) =>
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress;

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Traefik/Cloudflare)
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Un ZIP siempre empieza con PK (0x50 0x4B 0x03 0x04)
const isValidZip = (buffer) => {
    return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4B &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
    );
};

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

// Limiter para autenticación — 10 intentos cada 15 minutos
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos, espera 15 minutos' }
});

// Limiter general para toda la API — 100 requests por minuto
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intenta más tarde' }
});

// Auth — más restrictivo
app.use('/auth/google', authLimiter);
app.use('/auth/github', authLimiter);
app.use('/auth/logout', authLimiter);

// API general
app.use('/api', apiLimiter);

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
        logger.info({
            event: 'login',
            provider: 'google',
            userId: req.user.id,
            email: req.user.email,
            ip: getIP(req)
        }, 'Login exitoso');
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
        logger.info({
            event: 'login',
            provider: 'github',
            userId: req.user.id,
            email: req.user.email,
            ip: getIP(req)
        }, 'Login exitoso');
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
        logger.warn({
            event: 'auth_failed',
            ip: getIP(req),
            path: req.path
        }, 'Token inválido o expirado');
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// Sesión actual
app.get('/auth/me', requireAuth, (req, res) => {
    res.json({ authenticated: true, user: req.user });
});

// Logout
app.post('/auth/logout', (req, res) => {
    let user;
    try {
        user = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret');
    } catch {
        // token inválido o ausente, se ignora para el log
    }

    res.clearCookie('auth_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
    });

    logger.info({
        event: 'logout',
        userId: user?.id,
        ip: getIP(req)
    }, 'Logout');

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
// --- DETECCIÓN Y PROVISIÓN DE BASE DE DATOS ---
// ==========================================
function detectDatabase(repoPath) {
    const filesToCheck = [
        path.join(repoPath, '.env.example'),
        path.join(repoPath, '.env.sample'),
        path.join(repoPath, 'docker-compose.yml'),
        path.join(repoPath, 'docker-compose.yaml'),
        path.join(repoPath, 'railway.toml'),
        path.join(repoPath, 'railway.json'),
    ];

    let content = '';
    for (const f of filesToCheck) {
        if (fs.existsSync(f)) {
            content += fs.readFileSync(f, 'utf8').toLowerCase();
        }
    }

    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            const mysqlDeps = ['mysql', 'mysql2', 'sequelize', 'typeorm', 'prisma', 'knex'];
            const pgDeps = ['pg', 'postgres', 'sequelize', 'typeorm', 'prisma', 'knex'];
            if (mysqlDeps.some(d => deps.includes(d))) content += ' mysql';
            if (pgDeps.some(d => deps.includes(d))) content += ' postgres';
        } catch (e) {
            console.warn('[DB] No se pudo leer package.json para detección de DB:', e.message);
        }
    }

    const reqPath = path.join(repoPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
        const req = fs.readFileSync(reqPath, 'utf8').toLowerCase();
        if (req.includes('mysqlclient') || req.includes('pymysql') || req.includes('mysql')) content += ' mysql';
        if (req.includes('psycopg') || req.includes('asyncpg') || req.includes('postgres')) content += ' postgres';
    }

    const phpFiles = ['config/db.php', 'config/database.php', 'app/config/database.php'];
    for (const phpFile of phpFiles) {
        const phpPath = path.join(repoPath, phpFile);
        if (fs.existsSync(phpPath)) {
            const phpContent = fs.readFileSync(phpPath, 'utf8').toLowerCase();
            if (phpContent.includes('mysql')) content += ' mysql';
            if (phpContent.includes('pgsql') || phpContent.includes('postgres')) content += ' postgres';
        }
    }

    if (content.includes('mysql') || content.includes('mariadb') ||
        content.includes('mysqlhost') || content.includes('mysqldatabase')) {
        return 'mysql';
    }
    if (content.includes('postgres') || content.includes('postgresql') ||
        content.includes('pghost') || content.includes('database_url')) {
        return 'postgres';
    }
    return null;
}

function findSqlFiles(repoPath) {
    const priorityPatterns = [
        /schema\.sql$/i,
        /init\.sql$/i,
        /create\.sql$/i,
        /structure\.sql$/i,
        /migration.*\.sql$/i,
        /migrate.*\.sql$/i,
        /.*\.sql$/i,
    ];

    const searchDirs = [
        repoPath,
        path.join(repoPath, 'database'),
        path.join(repoPath, 'db'),
        path.join(repoPath, 'sql'),
        path.join(repoPath, 'migrations'),
        path.join(repoPath, 'migrate'),
        path.join(repoPath, 'schema'),
    ];

    const found = new Set();
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            for (const file of fs.readdirSync(dir)) {
                if (!file.endsWith('.sql')) continue;
                found.add(path.join(dir, file));
            }
        } catch (e) {}
    }

    return Array.from(found).sort((a, b) => {
        const aName = path.basename(a).toLowerCase();
        const bName = path.basename(b).toLowerCase();
        for (let i = 0; i < priorityPatterns.length; i++) {
            const aMatch = priorityPatterns[i].test(aName);
            const bMatch = priorityPatterns[i].test(bName);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
        }
        return aName.localeCompare(bName);
    });
}

async function importSqlFiles(sqlFiles, dbCredentials) {
    if (sqlFiles.length === 0) {
        console.log('[DB] No se encontraron archivos SQL para importar.');
        return;
    }

    console.log(`[DB] Importando ${sqlFiles.length} archivo(s) SQL...`);

    for (const sqlFile of sqlFiles) {
        const fileName = path.basename(sqlFile);
        console.log(`[DB] Importando: ${fileName}`);
        try {
            const sqlContent = fs.readFileSync(sqlFile, 'utf8');

            if (dbCredentials.dbType === 'mysql') {
                const execInstance = await docker.getContainer(dbCredentials.containerName).exec({
                    Cmd: ['mysql', `-u${dbCredentials.dbUser}`, `-p${dbCredentials.dbPassword}`, '--force', dbCredentials.dbName],
                    AttachStdin: true, AttachStdout: true, AttachStderr: true,
                });
                await new Promise((resolve, reject) => {
                    execInstance.start({ hijack: true, stdin: true }, (err, stream) => {
                        if (err) return reject(err);
                        stream.write(sqlContent);
                        stream.end();
                        stream.on('end', resolve);
                        stream.on('error', reject);
                        setTimeout(resolve, 10000);
                    });
                });
            } else {
                const execInstance = await docker.getContainer(dbCredentials.containerName).exec({
                    Cmd: ['psql', `-U${dbCredentials.dbUser}`, `-d${dbCredentials.dbName}`],
                    AttachStdin: true, AttachStdout: true, AttachStderr: true,
                    Env: [`PGPASSWORD=${dbCredentials.dbPassword}`],
                });
                await new Promise((resolve, reject) => {
                    execInstance.start({ hijack: true, stdin: true }, (err, stream) => {
                        if (err) return reject(err);
                        stream.write(sqlContent);
                        stream.end();
                        stream.on('end', resolve);
                        stream.on('error', reject);
                        setTimeout(resolve, 10000);
                    });
                });
            }

            console.log(`[DB] ✓ ${fileName} importado`);
        } catch (err) {
            console.warn(`[DB] Warning al importar ${fileName}: ${err.message}`);
        }
    }

    console.log('[DB] Importación SQL completada.');
}

async function provisionDatabase(subdomain, dbType, repoPath) {
    const crypto = require('crypto');
    const dbName = `db_${subdomain}`.replace(/-/g, '_');
    const dbUser = `user_${subdomain}`.replace(/-/g, '_').substring(0, 16);
    const dbPassword = crypto.randomBytes(12).toString('hex');
    const containerName = `db-${subdomain}`;

    const containers = await docker.listContainers({ all: true });
    const existing = containers.find(c => c.Names.includes(`/${containerName}`));
    if (existing) {
        console.log(`[DB] Contenedor ${containerName} ya existe, reutilizando...`);
        const labels = existing.Labels;
        return {
            containerName,
            dbType,
            dbName:     labels['db.name']     || dbName,
            dbUser:     labels['db.user']     || dbUser,
            dbPassword: labels['db.password'] || dbPassword,
            dbHost:     containerName,
            dbPort:     dbType === 'mysql' ? '3306' : '5432',
            adminerUrl: `https://db-${subdomain}.stardest.com`,
        };
    }

    console.log(`[DB] Provisionando ${dbType} para ${subdomain}...`);

    let dbContainer;
    if (dbType === 'mysql') {
        dbContainer = await docker.createContainer({
            Image: 'mysql:8',
            name: containerName,
            Env: [
                `MYSQL_ROOT_PASSWORD=${dbPassword}root`,
                `MYSQL_DATABASE=${dbName}`,
                `MYSQL_USER=${dbUser}`,
                `MYSQL_PASSWORD=${dbPassword}`,
            ],
            Labels: {
                'db.type':      'mysql',
                'db.name':      dbName,
                'db.user':      dbUser,
                'db.password':  dbPassword,
                'db.subdomain': subdomain,
            },
            HostConfig: {
                NetworkMode:   'deploys_internal_network',
                RestartPolicy: { Name: 'always' },
            }
        });
    } else {
        dbContainer = await docker.createContainer({
            Image: 'postgres:16-alpine',
            name: containerName,
            Env: [
                `POSTGRES_DB=${dbName}`,
                `POSTGRES_USER=${dbUser}`,
                `POSTGRES_PASSWORD=${dbPassword}`,
            ],
            Labels: {
                'db.type':      'postgres',
                'db.name':      dbName,
                'db.user':      dbUser,
                'db.password':  dbPassword,
                'db.subdomain': subdomain,
            },
            HostConfig: {
                NetworkMode:   'deploys_internal_network',
                RestartPolicy: { Name: 'always' },
            }
        });
    }

    await dbContainer.start();
    console.log(`[DB] ${dbType} iniciado: ${containerName}`);

    await new Promise(resolve => setTimeout(resolve, dbType === 'mysql' ? 15000 : 8000));

    // Crear contenedor Adminer para administración web
    const adminerContainerName = `adminer-${subdomain}`;
    const existingAdminer = (await docker.listContainers({ all: true }))
        .find(c => c.Names.includes(`/${adminerContainerName}`));

    if (!existingAdminer) {
        console.log(`[DB] Creando Adminer para ${subdomain}...`);
        const adminerContainer = await docker.createContainer({
            Image: 'adminer:latest',
            name: adminerContainerName,
            Env: [
                `ADMINER_DEFAULT_SERVER=${containerName}`,
            ],
            Labels: {
                "traefik.enable": "true",
                [`traefik.http.routers.${adminerContainerName}.rule`]: `Host(\`db-${subdomain}.stardest.com\`)`,
                [`traefik.http.routers.${adminerContainerName}.entrypoints`]: "web",
                [`traefik.http.services.${adminerContainerName}.loadbalancer.server.port`]: "8080",
                "db.subdomain": subdomain,
                "adminer.for": subdomain,
            },
            HostConfig: {
                NetworkMode: 'deploys_internal_network',
                RestartPolicy: { Name: 'always' },
            }
        });
        await adminerContainer.start();
        console.log(`[DB] Adminer disponible en: https://db-${subdomain}.stardest.com`);
    } else {
        console.log(`[DB] Adminer ya existe para ${subdomain}, reutilizando...`);
    }

    const credentials = {
        containerName,
        dbType,
        dbName,
        dbUser,
        dbPassword,
        dbHost: containerName,
        dbPort: dbType === 'mysql' ? '3306' : '5432',
        adminerUrl: `https://db-${subdomain}.stardest.com`,
    };

    // Importar SQL solo en el primer deploy (no en redeploys que reusan el contenedor)
    const sqlFiles = findSqlFiles(repoPath);
    if (sqlFiles.length > 0) {
        console.log(`[DB] Archivos SQL encontrados: ${sqlFiles.map(f => path.basename(f)).join(', ')}`);
        await importSqlFiles(sqlFiles, credentials);
    } else {
        console.log('[DB] No se encontraron archivos SQL en el repo.');
    }

    return credentials;
}

// ==========================================
// --- DETECCIÓN DE PUERTO ---
// ==========================================
function detectPort(repoPath) {
    // 1. Dockerfile EXPOSE / ENV PORT
    const dockerfilePath = path.join(repoPath, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
        const content = fs.readFileSync(dockerfilePath, 'utf8');
        const exposeMatch = content.match(/^EXPOSE\s+(\d+)/m);
        if (exposeMatch) {
            console.log(`[Port] Detectado en Dockerfile EXPOSE: ${exposeMatch[1]}`);
            return exposeMatch[1];
        }
        const envPortMatch = content.match(/ENV\s+PORT[=\s]+(\d+)/);
        if (envPortMatch) {
            console.log(`[Port] Detectado en Dockerfile ENV PORT: ${envPortMatch[1]}`);
            return envPortMatch[1];
        }
    }

    // 2. .env.example / .env.sample / .env.defaults
    for (const envFile of ['.env.example', '.env.sample', '.env.defaults']) {
        const envPath = path.join(repoPath, envFile);
        if (fs.existsSync(envPath)) {
            const match = fs.readFileSync(envPath, 'utf8').match(/^PORT\s*=\s*(\d+)/m);
            if (match) {
                console.log(`[Port] Detectado en ${envFile}: ${match[1]}`);
                return match[1];
            }
        }
    }

    // 3. package.json scripts.start --port / -p
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const startScript = pkg.scripts?.start || '';
            const portMatch = startScript.match(/--port[=\s]+(\d+)|-p\s+(\d+)/);
            if (portMatch) {
                const port = portMatch[1] || portMatch[2];
                console.log(`[Port] Detectado en package.json scripts.start: ${port}`);
                return port;
            }
        } catch (e) {}
    }

    // 4. nginx.conf listen
    for (const nginxFile of ['nginx.conf', 'docker/nginx.conf', 'config/nginx.conf']) {
        const nginxPath = path.join(repoPath, nginxFile);
        if (fs.existsSync(nginxPath)) {
            const listenMatch = fs.readFileSync(nginxPath, 'utf8').match(/listen\s+(\d+)/);
            if (listenMatch && listenMatch[1] !== '80' && listenMatch[1] !== '443') {
                console.log(`[Port] Detectado en ${nginxFile}: ${listenMatch[1]}`);
                return listenMatch[1];
            }
        }
    }

    // 5. docker-compose.yml ports mapping
    const composePath = path.join(repoPath, 'docker-compose.yml');
    if (fs.existsSync(composePath)) {
        const portsMatch = fs.readFileSync(composePath, 'utf8').match(/["']?(\d+):(\d+)["']?/);
        if (portsMatch) {
            console.log(`[Port] Detectado en docker-compose.yml: ${portsMatch[2]}`);
            return portsMatch[2];
        }
    }

    return null;
}

// ==========================================
// --- SOPORTE PARA MONOREPOS (docker-compose.yml en la raíz) ---
// ==========================================
const yaml = require('js-yaml');

function parseDockerCompose(repoPath) {
    const composeNames = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const name of composeNames) {
        const composePath = path.join(repoPath, name);
        if (fs.existsSync(composePath)) {
            try {
                const content = fs.readFileSync(composePath, 'utf8');
                return yaml.load(content);
            } catch (e) {
                console.warn(`[Compose] Error parseando ${name}: ${e.message}`);
                return null;
            }
        }
    }
    return null;
}

const INFRA_IMAGE_PATTERNS = [
    'mysql', 'mariadb', 'postgres', 'postgresql', 'mongo', 'redis',
    'phpmyadmin', 'adminer', 'pgadmin', 'mailhog', 'rabbitmq',
    'elasticsearch', 'memcached', 'nginx-proxy', 'traefik',
];

function isInfraService(serviceName, serviceConfig) {
    const image = (serviceConfig.image || '').toLowerCase();
    const name = serviceName.toLowerCase();
    return INFRA_IMAGE_PATTERNS.some(pattern => image.includes(pattern) || name.includes(pattern));
}

function findAppServices(compose) {
    if (!compose || !compose.services) return [];

    const services = compose.services;
    const appServices = [];

    for (const name of Object.keys(services)) {
        const svc = services[name];
        if (svc.build && !isInfraService(name, svc)) {
            appServices.push({ name, config: svc });
        }
    }

    return appServices;
}

function classifyService(serviceName, serviceConfig, dockerfileContent) {
    const name = serviceName.toLowerCase();

    // 1. Por nombre del servicio
    if (/front|client|web|ui|app$/i.test(name)) return 'frontend';
    if (/back|api|server/i.test(name)) return 'backend';

    // 2. Por imagen base del Dockerfile, si se pudo leer
    if (dockerfileContent) {
        const content = dockerfileContent.toLowerCase();
        if (/from\s+(node|nginx)/.test(content) && /(vite|react|vue|npm run build|next)/.test(content)) {
            return 'frontend';
        }
        if (/from\s+(php|python|.*-slim)/.test(content)) {
            return 'backend';
        }
    }

    return 'unknown';
}

const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.github', 'database', 'db', 'sql',
    'migrations', 'docs', 'scripts', '.vscode', '.idea', 'dist', 'build',
]);

function getComposeBuildContexts(compose) {
    const contexts = new Set();
    if (!compose || !compose.services) return contexts;

    for (const name of Object.keys(compose.services)) {
        const svc = compose.services[name];
        if (svc.build) {
            const ctx = typeof svc.build === 'string' ? svc.build : (svc.build.context || '.');
            contexts.add(path.normalize(ctx).replace(/^\.\//, ''));
        }
    }
    return contexts;
}

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

function generateFrontendDockerfile(dirPath) {
    const dockerfileContent = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN chmod -R +x node_modules/.bin
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

function detectPortFromDockerfile(dockerfilePath) {
    if (!fs.existsSync(dockerfilePath)) return null;
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    const match = content.match(/^EXPOSE\s+(\d+)/m);
    return match ? match[1] : null;
}

function resolveMultiServiceDeploy(repoPath, compose) {
    const appServices = findAppServices(compose);

    // Clasificar los servicios que sí están en el compose
    const classified = appServices.map(svc => {
        const buildConfig = svc.config.build;
        const buildContext = typeof buildConfig === 'string' ? buildConfig : (buildConfig.context || '.');
        const dockerfileRelative = typeof buildConfig === 'object' ? (buildConfig.dockerfile || 'Dockerfile') : 'Dockerfile';
        const absoluteContext = path.join(repoPath, buildContext);
        const absoluteDockerfile = path.join(absoluteContext, dockerfileRelative);

        let dockerfileContent = null;
        if (fs.existsSync(absoluteDockerfile)) {
            dockerfileContent = fs.readFileSync(absoluteDockerfile, 'utf8');
        }

        return {
            name: svc.name,
            config: svc.config,
            role: classifyService(svc.name, svc.config, dockerfileContent),
            buildContext: absoluteContext,
            dockerfilePath: absoluteDockerfile,
            port: resolveAppServicePort(svc.config),
            fromCompose: true,
        };
    });

    // Buscar carpetas huérfanas con Dockerfile que no estén en el compose
    const orphanDirs = findOrphanServiceDirs(repoPath, compose);
    for (const orphan of orphanDirs) {
        const dockerfileContent = fs.readFileSync(orphan.dockerfilePath, 'utf8');
        const role = classifyService(orphan.dirName, {}, dockerfileContent);

        classified.push({
            name: orphan.dirName,
            config: {}, // no tiene environment/ports definidos en compose
            role,
            buildContext: path.join(repoPath, orphan.dirName),
            dockerfilePath: orphan.dockerfilePath,
            port: detectPortFromDockerfile(orphan.dockerfilePath),
            fromCompose: false,
        });
    }

    if (classified.length === 0) return null;

    if (classified.length === 1) {
        return { mode: 'single', services: [classified[0]] };
    }

    const backend = classified.find(s => s.role === 'backend');
    const frontend = classified.find(s => s.role === 'frontend');

    if (backend && frontend) {
        console.log(`[Compose] Doble servicio detectado: backend="${backend.name}" (${backend.fromCompose ? 'compose' : 'huérfano'}), frontend="${frontend.name}" (${frontend.fromCompose ? 'compose' : 'huérfano'})`);
        return { mode: 'dual', backend, frontend };
    }

    console.warn('[Compose] Múltiples servicios detectados pero no se pudo clasificar frontend/backend claramente. Usando el primero del compose.');
    const fallback = classified.find(s => s.fromCompose) || classified[0];
    return { mode: 'single', services: [fallback] };
}

function resolveAppServicePort(serviceConfig) {
    if (!serviceConfig.ports || serviceConfig.ports.length === 0) return null;

    for (const portEntry of serviceConfig.ports) {
        // Formatos posibles: "8080:80", "80", { target: 80, published: 8080 }
        if (typeof portEntry === 'string') {
            const parts = portEntry.split(':');
            const containerPort = parts.length > 1 ? parts[1] : parts[0];
            const cleanPort = containerPort.replace(/\/(tcp|udp)$/, '');
            if (cleanPort && !isNaN(cleanPort)) return cleanPort;
        } else if (typeof portEntry === 'object' && portEntry.target) {
            return portEntry.target.toString();
        }
    }
    return null;
}

function mapAppEnvToDbCredentials(serviceConfig, dbServiceName, dbCredentials) {
    const envOverrides = [];
    const rawEnv = serviceConfig.environment;

    if (!rawEnv) return envOverrides;

    // environment puede ser array ["KEY=value"] o objeto { KEY: value }
    const envEntries = Array.isArray(rawEnv)
        ? rawEnv.map(e => {
              const [key, ...rest] = e.split('=');
              return [key, rest.join('=')];
          })
        : Object.entries(rawEnv);

    for (const [key, value] of envEntries) {
        const valStr = String(value).toLowerCase();
        const keyUpper = key.toUpperCase();

        // Si el valor original apuntaba al nombre del servicio de DB (ej. "db")
        if (dbServiceName && valStr === dbServiceName.toLowerCase()) {
            envOverrides.push(`${key}=${dbCredentials.dbHost}`);
            continue;
        }

        // Mapear por patrón en el nombre de la variable
        if (/HOST$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbHost}`);
        } else if (/PORT$/.test(keyUpper) && !/^APP_PORT|^PORT$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbPort}`);
        } else if (/(DB_NAME|DATABASE)$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbName}`);
        } else if (/(DB_USER|USERNAME|^DB_USER$)/.test(keyUpper) && /USER/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbUser}`);
        } else if (/(PASS|PASSWORD)$/.test(keyUpper)) {
            envOverrides.push(`${key}=${dbCredentials.dbPassword}`);
        }
        // Si no matchea ningún patrón conocido, no se sobreescribe (se ignora ese env var del compose)
    }

    return envOverrides;
}

function ensureDockerfileCopiesSource(dockerfilePath) {
    let content = fs.readFileSync(dockerfilePath, 'utf8');

    // Si ya existe una línea "COPY . <algo>" (copia del contexto completo), no tocar nada
    const hasFullCopy = /^\s*COPY\s+\.\s+\S+/m.test(content);

    if (hasFullCopy) {
        console.log('[Dockerfile] Ya copia el código fuente, no se modifica.');
        return;
    }

    console.log('[Dockerfile] No copia el código fuente (probablemente depende de volumes). Inyectando COPY . . automáticamente...');

    const lines = content.split('\n');

    // Insertar antes de la primera línea EXPOSE, CMD o ENTRYPOINT
    let insertIndex = lines.findIndex(l => /^\s*(EXPOSE|CMD|ENTRYPOINT)\s+/i.test(l));
    if (insertIndex === -1) insertIndex = lines.length; // si no hay ninguna, al final

    lines.splice(
        insertIndex,
        0,
        '',
        '# Auto-inyectado por StarDest: este Dockerfile dependía de volumes que',
        '# solo existen en desarrollo local. Se copia el código fuente para producción.',
        'COPY . .',
        ''
    );

    fs.writeFileSync(dockerfilePath, lines.join('\n'));
    console.log('[Dockerfile] COPY . . inyectado correctamente.');
}

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

async function deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath) {
    const { backend, frontend } = deployPlan;
    const backendImageName = `user-app-${subdomain.toLowerCase()}-backend`;
    const frontendImageName = `user-app-${subdomain.toLowerCase()}-frontend`;

    console.log(`[Dual] Iniciando deploy dual para ${subdomain}`);

    // 1. Provisionar DB si aplica (solo se conecta al backend)
    let dbCredentials = null;
    if (dbType) {
        dbCredentials = await provisionDatabase(subdomain, dbType, repoPath);
    }

    // 2. Parchar y construir imagen del BACKEND
    ensureDockerfileCopiesSource(backend.dockerfilePath);
    console.log(`[Dual] Construyendo backend desde ${backend.buildContext}...`);
    let stream = await docker.buildImage(
        { context: backend.buildContext, src: ['.'] },
        { t: backendImageName, dockerfile: path.basename(backend.dockerfilePath) }
    );
    await runDockerBuild(stream);

    // 3. Parchar y construir imagen del FRONTEND
    ensureDockerfileCopiesSource(frontend.dockerfilePath);
    console.log(`[Dual] Construyendo frontend desde ${frontend.buildContext}...`);
    stream = await docker.buildImage(
        { context: frontend.buildContext, src: ['.'] },
        { t: frontendImageName, dockerfile: path.basename(frontend.dockerfilePath) }
    );
    await runDockerBuild(stream);

    // 4. Limpiar contenedores anteriores (backend, frontend, y el legacy single si existía)
    const containers = await docker.listContainers({ all: true });
    for (const suffix of ['-backend', '-frontend', '']) {
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}${suffix}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }
    }

    // 5. Variables de entorno del backend (incluye mapeo de DB si aplica)
    let backendEnv = [];
    if (dbCredentials) {
        backendEnv = dbCredentials.dbType === 'mysql' ? [
            `MYSQLHOST=${dbCredentials.dbHost}`,
            `MYSQLPORT=${dbCredentials.dbPort}`,
            `MYSQLDATABASE=${dbCredentials.dbName}`,
            `MYSQLUSER=${dbCredentials.dbUser}`,
            `MYSQLPASSWORD=${dbCredentials.dbPassword}`,
            `DATABASE_URL=mysql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ] : [
            `PGHOST=${dbCredentials.dbHost}`,
            `PGPORT=${dbCredentials.dbPort}`,
            `PGDATABASE=${dbCredentials.dbName}`,
            `PGUSER=${dbCredentials.dbUser}`,
            `PGPASSWORD=${dbCredentials.dbPassword}`,
            `DATABASE_URL=postgresql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
        ];

        const dbServiceName = Object.keys(deployPlan.backend.config).length
            ? Object.keys((await parseDockerCompose(repoPath)).services).find(name =>
                isInfraService(name, (parseDockerCompose(repoPath)).services[name])
              )
            : null;
        const mappedEnv = mapAppEnvToDbCredentials(backend.config, dbServiceName, dbCredentials);
        backendEnv = [...backendEnv, ...mappedEnv];
    }

    // 6. Lanzar contenedor BACKEND con PathPrefix /api
    const backendPort = backend.port || '80';
    const backendContainer = await docker.createContainer({
        Image: backendImageName,
        name: `container-${subdomain}-backend`,
        Env: backendEnv,
        Labels: {
            "traefik.enable": "true",
            [`traefik.http.routers.${subdomain}-backend.rule`]: `Host(\`${subdomain}.stardest.com\`) && PathPrefix(\`/api\`)`,
            [`traefik.http.routers.${subdomain}-backend.entrypoints`]: "web",
            [`traefik.http.routers.${subdomain}-backend.priority`]: "10",
            [`traefik.http.services.${subdomain}-backend.loadbalancer.server.port`]: backendPort,
            "deploy.subdomain": subdomain,
            "deploy.role": "backend",
            "deploy.branch": branch || "main",
            "deploy.repo": repoUrl,
            "deploy.timestamp": new Date().toISOString(),
            "deploy.userId": userId || 'anonymous',
            "deploy.userEmail": userEmail || 'anonymous',
            ...(dbCredentials ? {
                "deploy.db.type":       dbCredentials.dbType,
                "deploy.db.host":       dbCredentials.dbHost,
                "deploy.db.port":       dbCredentials.dbPort,
                "deploy.db.name":       dbCredentials.dbName,
                "deploy.db.user":       dbCredentials.dbUser,
                "deploy.db.password":   dbCredentials.dbPassword,
                "deploy.db.adminerUrl": dbCredentials.adminerUrl || '',
            } : {}),
        },
        HostConfig: {
            NetworkMode: "deploys_internal_network",
            RestartPolicy: { Name: "always" },
            Privileged: true,
        }
    });
    await backendContainer.start();
    console.log(`[Dual] ✓ Backend desplegado en ${subdomain}.stardest.com/api`);

    // 7. Lanzar contenedor FRONTEND como catch-all
    const frontendPort = frontend.port || '80';
    const frontendContainer = await docker.createContainer({
        Image: frontendImageName,
        name: `container-${subdomain}-frontend`,
        Labels: {
            "traefik.enable": "true",
            [`traefik.http.routers.${subdomain}-frontend.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
            [`traefik.http.routers.${subdomain}-frontend.entrypoints`]: "web",
            [`traefik.http.routers.${subdomain}-frontend.priority`]: "5",
            [`traefik.http.services.${subdomain}-frontend.loadbalancer.server.port`]: frontendPort,
            "deploy.subdomain": subdomain,
            "deploy.role": "frontend",
            "deploy.branch": branch || "main",
            "deploy.repo": repoUrl,
            "deploy.timestamp": new Date().toISOString(),
            "deploy.userId": userId || 'anonymous',
            "deploy.userEmail": userEmail || 'anonymous',
        },
        HostConfig: {
            NetworkMode: "deploys_internal_network",
            RestartPolicy: { Name: "always" },
        }
    });
    await frontendContainer.start();
    console.log(`[Dual] ✓ Frontend desplegado en ${subdomain}.stardest.com`);

    return `https://${subdomain}.stardest.com`;
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

        const cloneOptions = ['--depth', '1', '--recurse-submodules'];
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
        const hasIndexHtml = fs.existsSync(path.join(repoPath, 'index.html'));

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

        // Detectar si hay un docker-compose.yml en la raíz con uno o más servicios de app
        // (compose puede ser null — resolveMultiServiceDeploy también busca carpetas huérfanas sin él)
        const compose = parseDockerCompose(repoPath);
        const deployPlan = resolveMultiServiceDeploy(repoPath, compose);

        // PASO 3 — Detectar base de datos (la provisión ocurre más abajo, salvo en modo dual)
        const dbType = detectDatabase(repoPath);

        if (deployPlan && deployPlan.mode === 'dual') {
            return await deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath);
        }

        // Si es modo 'single', adaptar a la variable monorepoApp existente para no romper monorepo-compose.md
        let monorepoApp = null;
        if (deployPlan && deployPlan.mode === 'single' && deployPlan.services[0]) {
            const svc = deployPlan.services[0];

            if (fs.existsSync(svc.dockerfilePath)) {
                console.log(`[Compose] App detectada: servicio "${svc.name}" (${svc.fromCompose ? 'compose' : 'huérfano'})`);
                console.log(`[Compose] Build context: ${svc.buildContext}, Dockerfile: ${path.basename(svc.dockerfilePath)}`);

                monorepoApp = {
                    serviceName: svc.name,
                    buildContext: svc.buildContext,
                    dockerfilePath: svc.dockerfilePath,
                    port: svc.port,
                    serviceConfig: svc.config,
                };
            }
        }

        let dbCredentials = null;

        if (dbType) {
            console.log(`[DB] Base de datos detectada: ${dbType}`);
            dbCredentials = await provisionDatabase(subdomain, dbType, repoPath);
            console.log(`[DB] Credenciales listas para ${subdomain}`);
        }

        // Detectar puerto del repo
        let appPort = monorepoApp?.port || detectPort(repoPath);
        if (!appPort) {
            if (isNextJs)      appPort = '3000';
            else if (isVite)   appPort = '3000';
            else if (isPython) appPort = '3000';
            else if (isNode)   appPort = '3000';
            else               appPort = '3000';
        }
        console.log(`[Port] Puerto final para ${subdomain}: ${appPort}`);

        if (hasDockerfile || monorepoApp) {
            console.log(monorepoApp
                ? `Monorepo detectado. Usando Dockerfile en ${monorepoApp.buildContext}...`
                : `Dockerfile detectado. Usando build tradicional...`);

            const buildContext = monorepoApp ? monorepoApp.buildContext : repoPath;
            const dockerfileFullPath = monorepoApp ? monorepoApp.dockerfilePath : path.join(repoPath, 'Dockerfile');
            const dockerfileName = path.basename(dockerfileFullPath);

            // Asegurar que el Dockerfile copie el código fuente antes de buildear
            ensureDockerfileCopiesSource(dockerfileFullPath);

            const stream = await docker.buildImage(
                { context: buildContext, src: ['.'] },
                { t: imageName, dockerfile: dockerfileName }
            );
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
RUN echo 'server { listen ${appPort}; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE ${appPort}
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
EXPOSE ${appPort}
CMD ["uvicorn", "${uvicornModule}", "--host", "0.0.0.0", "--port", "${appPort}"]
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
EXPOSE ${appPort}
ENV PORT=${appPort}
CMD ["npm", "start"]
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile para Node.js generado exitosamente.');
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (hasIndexHtml) {
            console.log(`Sitio estático detectado (index.html). Generando Dockerfile con Nginx...`);
            const dockerfile = `FROM nginx:alpine
RUN printf 'server {\\nlisten ${appPort};\\nroot /usr/share/nginx/html;\\nindex index.html;\\nlocation / {\\ntry_files $uri $uri/ /index.html;\\n}\\n}\\n' > /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE ${appPort}
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile estático de Nginx generado exitosamente.');
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

        let dbEnv = [];
        if (dbCredentials) {
            if (dbCredentials.dbType === 'mysql') {
                dbEnv = [
                    `MYSQLHOST=${dbCredentials.dbHost}`,
                    `MYSQLPORT=${dbCredentials.dbPort}`,
                    `MYSQLDATABASE=${dbCredentials.dbName}`,
                    `MYSQLUSER=${dbCredentials.dbUser}`,
                    `MYSQLPASSWORD=${dbCredentials.dbPassword}`,
                    `DATABASE_URL=mysql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
                ];
            } else {
                dbEnv = [
                    `PGHOST=${dbCredentials.dbHost}`,
                    `PGPORT=${dbCredentials.dbPort}`,
                    `PGDATABASE=${dbCredentials.dbName}`,
                    `PGUSER=${dbCredentials.dbUser}`,
                    `PGPASSWORD=${dbCredentials.dbPassword}`,
                    `DATABASE_URL=postgresql://${dbCredentials.dbUser}:${dbCredentials.dbPassword}@${dbCredentials.dbHost}:${dbCredentials.dbPort}/${dbCredentials.dbName}`,
                ];
            }

            // Variables específicas detectadas del docker-compose.yml original del repo
            if (monorepoApp) {
                const dbServiceName = Object.keys(compose.services).find(name => {
                    const svc = compose.services[name];
                    return isInfraService(name, svc) && (svc.image || '').toLowerCase().includes(dbCredentials.dbType);
                });
                const mappedEnv = mapAppEnvToDbCredentials(monorepoApp.serviceConfig, dbServiceName, dbCredentials);
                dbEnv = [...dbEnv, ...mappedEnv];
                console.log(`[Compose] Variables de entorno mapeadas: ${mappedEnv.join(', ')}`);
            }
        }

        const container = await docker.createContainer({
            Image: imageName,
            name: `container-${subdomain}`,
            Env: dbEnv,
            Labels: {
                "traefik.enable": "true",
                [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
                [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
                [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: appPort,
                "deploy.port": appPort,
                "deploy.branch": branch || "main",
                "deploy.repo": repoUrl,
                "deploy.timestamp": new Date().toISOString(),
                "deploy.userId": userId,
                "deploy.userEmail": userEmail,
                ...(dbCredentials ? {
                    "deploy.db.type":       dbCredentials.dbType,
                    "deploy.db.host":       dbCredentials.dbHost,
                    "deploy.db.port":       dbCredentials.dbPort,
                    "deploy.db.name":       dbCredentials.dbName,
                    "deploy.db.user":       dbCredentials.dbUser,
                    "deploy.db.password":   dbCredentials.dbPassword,
                    "deploy.db.adminerUrl": dbCredentials.adminerUrl,
                } : {}),
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

    logger.info({
        event: 'deploy_start',
        userId: req.user?.id,
        subdomain,
        repoUrl,
        branch: branch || 'default',
        ip: getIP(req)
    }, 'Deploy iniciado');

    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch, userId, userEmail);
        saveDeployment(repoUrl, actualBranch, subdomain);
        logger.info({
            event: 'deploy_success',
            userId: req.user?.id,
            subdomain,
            ip: getIP(req)
        }, 'Deploy completado');
        res.json({
            status: 'success',
            url: url,
            message: 'Aplicación desplegada exitosamente',
            branch: actualBranch,
            deployedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error({
            event: 'deploy_error',
            userId: req.user?.id,
            subdomain,
            error: error.message,
            ip: getIP(req)
        }, 'Deploy fallido');
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// 1b. Listar ramas de un repositorio de GitHub (proxy server-side para evitar
// problemas de CORS/conectividad del navegador hacia api.github.com)
app.get('/github/branches', requireAuth, async (req, res) => {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
        return res.status(400).json({ status: 'error', message: 'Faltan owner o repo' });
    }
    try {
        const ghRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, {
            headers: { 'User-Agent': 'StarDest' }
        });
        if (!ghRes.ok) {
            return res.status(ghRes.status).json({ status: 'error', message: 'Repositorio no encontrado o privado' });
        }
        const data = await ghRes.json();
        res.json({ status: 'success', branches: data.map(b => b.name) });
    } catch (error) {
        res.status(502).json({ status: 'error', message: 'No se pudo contactar a GitHub', details: error.message });
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
        const possibleNames = [
            `/container-${subdomain}`,
            `/container-${subdomain}-backend`,
            `/container-${subdomain}-frontend`,
            `/db-${subdomain}`,
            `/adminer-${subdomain}`,
        ];

        let removedAny = false;
        for (const name of possibleNames) {
            const existing = containers.find(c => c.Names.includes(name));
            if (existing) {
                await docker.getContainer(existing.Id).remove({ force: true });
                console.log(`Contenedor ${name} eliminado.`);
                removedAny = true;
            }
        }

        if (removedAny) {
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
        const appContainers = containers
            .filter(c => c.Names.some(name => name.includes('container-')))
            .filter(c => {
                // Si hay usuario autenticado, filtrar por su ID
                if (!filterUserId) return true;
                return c.Labels['deploy.userId'] === filterUserId;
            });

        // Agrupar por subdominio (usando el label deploy.subdomain si existe, o el nombre)
        const grouped = {};
        for (const c of appContainers) {
            const labels = c.Labels;
            const subdomain = labels['deploy.subdomain'] || c.Names[0].replace('/container-', '').replace(/-backend$|-frontend$/, '');

            if (!grouped[subdomain]) {
                grouped[subdomain] = {
                    subdomain,
                    status: c.State,
                    branch: labels['deploy.branch'] || 'unknown',
                    repo: labels['deploy.repo'] || 'unknown',
                    deployedAt: labels['deploy.timestamp'] || 'unknown',
                    userId: labels['deploy.userId'] || 'unknown',
                    userEmail: labels['deploy.userEmail'] || 'unknown',
                    roles: [],
                    database: labels['deploy.db.type'] ? {
                        type: labels['deploy.db.type'],
                        host: labels['deploy.db.host'],
                        port: labels['deploy.db.port'],
                        name: labels['deploy.db.name'],
                        user: labels['deploy.db.user'],
                        password: labels['deploy.db.password'],
                        adminerUrl: labels['deploy.db.adminerUrl'] || null,
                    } : null,
                };
            }

            grouped[subdomain].roles.push(labels['deploy.role'] || 'app');
            // Si cualquiera de los componentes no está 'running', reflejarlo
            if (c.State !== 'running') grouped[subdomain].status = c.State;
        }

        res.json({ status: 'success', deploys: Object.values(grouped) });
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

    // Validación de magic bytes — debe ser lo primero
    if (!isValidZip(req.file.buffer)) {
        return res.status(400).json({ status: 'error', message: 'Archivo inválido. Solo se aceptan ZIPs reales.' });
    }

    try {
        if (!fs.existsSync(STATIC_SITES_DIR)) fs.mkdirSync(STATIC_SITES_DIR, { recursive: true });
        if (!fs.existsSync(NGINX_CONFIGS_DIR)) fs.mkdirSync(NGINX_CONFIGS_DIR, { recursive: true });

        const siteDir = path.join(STATIC_SITES_DIR, subdomain);
        if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true });
        fs.mkdirSync(siteDir, { recursive: true });

        console.log(`[Upload] Extrayendo zip para: ${subdomain} (${req.file.size} bytes)`);
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();

        const MAX_UNCOMPRESSED = 500 * 1024 * 1024; // 500 MB
        const totalUncompressed = zipEntries.reduce((acc, entry) => acc + entry.header.size, 0);

        if (totalUncompressed > MAX_UNCOMPRESSED) {
            return res.status(400).json({ status: 'error', message: 'El archivo ZIP excede el tamaño máximo permitido descomprimido.' });
        }

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