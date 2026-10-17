const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const crypto = require('crypto');
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

// rawBody: la firma de los webhooks de GitHub se calcula sobre los bytes exactos recibidos
const keepRawBody = (req, _res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: '1mb', verify: keepRawBody })); // una pizarra grande pasa el default de 100 KB
app.use(express.urlencoded({ extended: true, verify: keepRawBody }));
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
    res.json({ authenticated: true, user: { ...req.user, isAdmin: isAdminUser(req.user) } });
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

// POST /github-token — guardar o actualizar el token del usuario
app.post('/github-token', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { githubToken } = req.body;
    if (!githubToken || typeof githubToken !== 'string' || githubToken.trim().length < 10) {
        return res.status(400).json({ ok: false, error: 'Token de GitHub inválido' });
    }
    try {
        const ghRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${githubToken.trim()}` }
        });
        if (!ghRes.ok) {
            return res.status(400).json({ ok: false, error: 'El token de GitHub no es válido o no tiene los permisos necesarios' });
        }
        const ghUser = await ghRes.json();
        saveUserToken(userId, githubToken.trim());
        console.log(`[Token] Token de GitHub guardado para userId ${userId} (GitHub: ${ghUser.login})`);
        res.json({ ok: true, githubUsername: ghUser.login });
    } catch (e) {
        saveUserToken(userId, githubToken.trim());
        res.json({ ok: true, githubUsername: null });
    }
});

// GET /github-token/status — verificar si el usuario tiene token guardado
app.get('/github-token/status', requireAuth, (req, res) => {
    const token = getUserToken(req.user.id);
    res.json({ connected: !!token });
});

// DELETE /github-token — eliminar el token del usuario
app.delete('/github-token', requireAuth, (req, res) => {
    deleteUserToken(req.user.id);
    res.json({ ok: true });
});

// ==========================================
// --- SISTEMA DE MEMORIA PARA WEBHOOKS ---
// ==========================================
const DB_FILE = path.join(__dirname, 'deployments.json');

// ==========================================
// --- TOKENS DE GITHUB POR USUARIO ---
// ==========================================
const TOKENS_FILE = path.join(process.env.DEPLOYS_DIR || path.join(__dirname, '..', '..'), 'user_tokens.json');
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-secret').digest();

function encryptToken(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(ciphertext) {
    const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function saveUserToken(userId, token) {
    let tokens = {};
    if (fs.existsSync(TOKENS_FILE)) {
        try { tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch (e) {}
    }
    tokens[userId] = encryptToken(token);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function getUserToken(userId) {
    if (!userId || !fs.existsSync(TOKENS_FILE)) return null;
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        if (!tokens[userId]) return null;
        return decryptToken(tokens[userId]);
    } catch (e) {
        console.warn('[Token] Error descifrando token:', e.message);
        return null;
    }
}

function deleteUserToken(userId) {
    if (!fs.existsSync(TOKENS_FILE)) return;
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        delete tokens[userId];
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch (e) {}
}

// ==========================================
// --- DOMINIOS PERSONALIZADOS POR DEPLOY ---
// ==========================================
const CUSTOM_DOMAINS_FILE = path.join(process.env.DEPLOYS_DIR || path.join(__dirname, '..', '..'), 'custom_domains.json');

function readCustomDomains() {
    if (!fs.existsSync(CUSTOM_DOMAINS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(CUSTOM_DOMAINS_FILE, 'utf8')); } catch (e) { return {}; }
}

function writeCustomDomains(data) {
    fs.writeFileSync(CUSTOM_DOMAINS_FILE, JSON.stringify(data, null, 2));
}

function normalizeUrl(url) {
    return String(url || '').trim()
        .replace(/\/+$/, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '')
        .toLowerCase();
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
            const mysqlDeps = ['mysql', 'mysql2'];
            const pgDeps = ['pg', 'pg-pool', 'postgres'];
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

    // Servidores Dart: solo drivers específicos (señales ambiguas no cuentan)
    const dartPub = readPubspec(repoPath);
    if (dartPub && !dartPub.dependencies?.flutter) {   // una app Flutter no usa drivers de servidor
        const dartDeps = Object.keys({ ...dartPub.dependencies, ...dartPub.dev_dependencies });
        if (dartDeps.some(d => ['postgres', 'postgres_pool', 'drift_postgres'].includes(d))) content += ' postgres';
        if (dartDeps.some(d => ['mysql1', 'mysql_client', 'mysql'].includes(d))) content += ' mysql';
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

    // PHP plano (sin Composer, sin Dockerfile): el Dockerfile generado para este caso
    // solo instala las extensiones mysqli/pdo_mysql, así que aquí solo se detecta mysql.
    const plainPhpFiles = fs.readdirSync(repoPath).filter(f => f.endsWith('.php'));
    for (const f of plainPhpFiles) {
        const phpContent = fs.readFileSync(path.join(repoPath, f), 'utf8').toLowerCase();
        if (phpContent.includes('mysqli') || phpContent.includes('pdo_mysql') || phpContent.includes('mysql_connect')) {
            content += ' mysql';
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
        // Verificar si hay un contenedor de app vivo asociado a este subdominio.
        // Si no hay ninguno, esta DB es huérfana de un deploy que nunca terminó con éxito.
        const hasLiveApp = containers.some(c =>
            c.Names.includes(`/container-${subdomain}`) ||
            c.Names.includes(`/container-${subdomain}-backend`) ||
            c.Names.includes(`/container-${subdomain}-frontend`)
        );

        if (!hasLiveApp) {
            console.warn(`[DB] Contenedor ${containerName} existe pero no hay app asociada — es residuo de un deploy fallido. Recreando limpio...`);

            // Borrar la DB huérfana
            await docker.getContainer(existing.Id).remove({ force: true });

            // Borrar también su Adminer huérfano, si existe
            const orphanAdminer = containers.find(c => c.Names.includes(`/adminer-${subdomain}`));
            if (orphanAdminer) {
                await docker.getContainer(orphanAdminer.Id).remove({ force: true });
            }

            // No retornar aquí — continuar el flujo normal de creación, más abajo
        } else {
            console.log(`[DB] Contenedor ${containerName} ya existe y hay una app asociada, reutilizando...`);
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
        if (/flutter build web/.test(dockerfileContent)) return 'frontend';
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
    // Si la raíz ya es un proyecto Dart/Flutter, sus subcarpetas Flutter (p. ej. example/
    // de un paquete) no son servicios: se desplegaría eso en lugar de la app principal.
    const rootIsDart = !!readPubspec(repoPath);

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

        // No tiene Dockerfile — ¿frontend Flutter sin contenerizar?
        if (!rootIsDart) {
            const dart = detectDartProject(dirFullPath);
            if (dart?.kind === 'flutter' && fs.existsSync(path.join(dirFullPath, 'lib', 'main.dart'))) {
                dockerfilePath = writeFlutterWebDockerfile(dirFullPath, detectFlutterVersion(dirFullPath));
                orphans.push({ dirName, dockerfilePath });
                continue;
            }
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

// ==========================================
// --- LOGS DE DEPLOY EN TIEMPO REAL (SSE) ---
// ==========================================
// Mapa de subdomain → Set<res> (una conexión SSE por pestaña/cliente escuchando)
const deployLogClients = new Map();

function emitDeployLog(subdomain, data) {
    const clients = deployLogClients.get(subdomain);
    if (!clients || clients.size === 0) return;
    const payload = JSON.stringify(data);
    clients.forEach(res => {
        try { res.write(`data: ${payload}\n\n`); } catch (e) {}
    });
}

function deployLog(subdomain, type, message) {
    if (type === 'error') console.error(`[${subdomain}] ${message}`);
    else console.log(`[${subdomain}] ${message}`);
    emitDeployLog(subdomain, { type, message, ts: Date.now() });
}

// ==========================================
// --- RATE LIMITING DE DEPLOYS POR USUARIO ---
// ==========================================
// En memoria (no persiste entre reinicios) — suficiente porque los reinicios
// del servidor son poco frecuentes en este stack.
const deployInProgress = new Map(); // userId → número de deploys activos
const deployHistory    = new Map(); // userId → array de timestamps

const MAX_CONCURRENT_DEPLOYS = 3;   // deploys simultáneos por usuario
const MAX_DEPLOYS_PER_HOUR   = 10;  // deploys por hora por usuario
const ONE_HOUR_MS            = 60 * 60 * 1000;

function canDeploy(userId) {
    const concurrent = deployInProgress.get(userId) || 0;
    if (concurrent >= MAX_CONCURRENT_DEPLOYS) {
        return {
            allowed: false,
            code: 'CONCURRENT_LIMIT',
            reason: `Tienes ${concurrent} deploys en progreso. Espera a que terminen antes de iniciar otro.`,
        };
    }

    const now = Date.now();
    const history = (deployHistory.get(userId) || []).filter(t => now - t < ONE_HOUR_MS);
    deployHistory.set(userId, history);

    if (history.length >= MAX_DEPLOYS_PER_HOUR) {
        const resetIn = Math.ceil((history[0] + ONE_HOUR_MS - now) / 60000);
        return {
            allowed: false,
            code: 'HOURLY_LIMIT',
            reason: `Límite de ${MAX_DEPLOYS_PER_HOUR} deploys por hora alcanzado. Podrás desplegar en ${resetIn} minuto${resetIn > 1 ? 's' : ''}.`,
        };
    }

    return { allowed: true };
}

function startDeployTracking(userId) {
    deployInProgress.set(userId, (deployInProgress.get(userId) || 0) + 1);
    const history = deployHistory.get(userId) || [];
    history.push(Date.now());
    deployHistory.set(userId, history);
}

function endDeployTracking(userId) {
    const current = deployInProgress.get(userId) || 1;
    if (current <= 1) deployInProgress.delete(userId);
    else deployInProgress.set(userId, current - 1);
}

// Máximo de proyectos (subdominios) activos simultáneos por usuario.
const MAX_DEPLOYS_PER_USER = 5;

// Cuenta subdominios distintos con al menos un contenedor 'running' del
// usuario. En modo dual (backend+frontend) ambos contenedores comparten
// subdominio y cuentan como un solo proyecto. `excludeSubdomain` deja afuera
// el subdominio al que se está desplegando ahora mismo, para que redesplegar
// un proyecto ya existente no consuma el límite.
async function countActiveDeploys(userId, excludeSubdomain) {
    const containers = await docker.listContainers({ all: true });
    const subdomains = new Set();
    for (const c of containers) {
        if (c.State !== 'running') continue;
        if (c.Labels['deploy.userId'] !== userId) continue;
        if (!c.Names.some(n => n.includes('container-'))) continue;
        const subdomain = c.Labels['deploy.subdomain'] || c.Names[0].replace('/container-', '').replace(/-backend$|-frontend$/, '');
        if (subdomain === excludeSubdomain) continue;
        subdomains.add(subdomain);
    }
    return subdomains.size;
}

const runDockerBuild = (stream, subdomain) => new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err, outputRes) => {
        if (err) return reject(err);
        outputRes.forEach(line => {
            if (line.stream) {
                process.stdout.write(line.stream);
                const msg = line.stream.trim();
                if (msg && subdomain) deployLog(subdomain, 'build', msg);
            }
            if (line.error) {
                process.stderr.write(line.error);
                if (subdomain) deployLog(subdomain, 'error', line.error.trim());
            }
        });
        const errorLine = outputRes.find(l => l.error);
        if (errorLine) {
            const e = new Error(`Docker build falló: ${errorLine.error.trim()}`);
            e.buildOutput = outputRes.map(l => l.stream || l.error || '').join('');
            return reject(e);
        }
        resolve(outputRes);
    });
});

// Filtra las variables de entorno personalizadas que el usuario agrega desde
// el formulario de deploy: deben ser "NOMBRE=valor" con un nombre válido de
// variable de entorno. No son shell-interpoladas (van directo al array Env
// de la API de Docker), pero igual se validan del lado del servidor por si
// alguien llama al endpoint directo sin pasar por el sanitizado del frontend.
const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
function sanitizeUserEnv(userEnv) {
    if (!Array.isArray(userEnv)) return [];
    return userEnv.filter(v => typeof v === 'string' && ENV_VAR_PATTERN.test(v));
}

async function deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath, userEnv = []) {
    const { backend, frontend } = deployPlan;
    const backendImageName = `user-app-${subdomain.toLowerCase()}-backend`;
    const frontendImageName = `user-app-${subdomain.toLowerCase()}-frontend`;

    console.log(`[Dual] Iniciando deploy dual para ${subdomain}`);

    // 1. Provisionar DB si aplica (solo se conecta al backend)
    let dbCredentials = null;
    if (dbType) {
        dbCredentials = await provisionDatabase(subdomain, dbType, backend.buildContext);
    }

    // 2. Parchar y construir imagen del BACKEND
    ensureDockerfileCopiesSource(backend.dockerfilePath);
    console.log(`[Dual] Construyendo backend desde ${backend.buildContext}...`);
    let stream = await docker.buildImage(
        { context: backend.buildContext, src: ['.'] },
        { t: backendImageName, dockerfile: path.basename(backend.dockerfilePath) }
    );
    await runDockerBuild(stream, subdomain);

    // 3. Parchar y construir imagen del FRONTEND
    ensureDockerfileCopiesSource(frontend.dockerfilePath);
    console.log(`[Dual] Construyendo frontend desde ${frontend.buildContext}...`);
    const buildFrontend = async () => {
        const fstream = await docker.buildImage(
            { context: frontend.buildContext, src: ['.'] },
            { t: frontendImageName, dockerfile: path.basename(frontend.dockerfilePath) }
        );
        await runDockerBuild(fstream, subdomain);
    };
    // Un frontend Flutter entra en la cola de builds de Flutter (uno a la vez por la RAM)
    const isFlutterFrontend = /flutter build web/.test(fs.readFileSync(frontend.dockerfilePath, 'utf8'));
    // (findOrphanServiceDirs es síncrono y no puede consultar la última estable: acá se
    // resuelve la versión y se regenera el Dockerfile antes de construir)
    if (isFlutterFrontend) await buildFlutterWithRetry(frontend.buildContext, subdomain, buildFrontend);
    else await buildFrontend();

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
    const cleanUserEnv = sanitizeUserEnv(userEnv);
    const backendContainer = await docker.createContainer({
        Image: backendImageName,
        name: `container-${subdomain}-backend`,
        Env: [...backendEnv, ...cleanUserEnv],
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
            "deploy.userEnv": JSON.stringify(cleanUserEnv),
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

    // Correr migraciones en el backend si aplica
    const migrationCmd = detectMigrationCommand(repoPath, backend.buildContext);
    if (migrationCmd && dbCredentials) {
        await runMigrations(`container-${subdomain}-backend`, migrationCmd.cmd);
    }

    // 7. Lanzar contenedor FRONTEND como catch-all
    const frontendPort = frontend.port || '80';
    const frontendContainer = await docker.createContainer({
        Image: frontendImageName,
        name: `container-${subdomain}-frontend`,
        Env: cleanUserEnv,
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
            "deploy.userEnv": JSON.stringify(cleanUserEnv),
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
// --- DETECCIÓN Y EJECUCIÓN DE MIGRACIONES ---
// ==========================================

function detectMigrationCommand(repoPath, appDirPath) {
    const searchPath = appDirPath || repoPath;

    const pkgPath = path.join(searchPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const scripts = pkg.scripts || {};
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const migrationScriptKeys = [
                'migration:run', 'migrate', 'db:migrate', 'migration:run:prod',
                'typeorm:migrate', 'prisma:migrate', 'migrate:deploy',
                'db:migrate:deploy', 'migration', 'migrations:run',
            ];
            for (const key of migrationScriptKeys) {
                if (scripts[key]) {
                    console.log(`[Migration] Script encontrado en package.json: npm run ${key}`);
                    return { cmd: `npm run ${key}`, type: 'npm' };
                }
            }

            if (deps.prisma || deps['@prisma/client']) {
                console.log('[Migration] Prisma detectado');
                return { cmd: 'npx prisma migrate deploy', type: 'prisma' };
            }
            if (deps.typeorm || deps['@nestjs/typeorm']) {
                const dataSources = [
                    'src/data-source.ts', 'src/database/data-source.ts',
                    'src/config/data-source.ts', 'src/typeorm.config.ts',
                    'dist/data-source.js', 'data-source.ts',
                ];
                const found = dataSources.find(ds => fs.existsSync(path.join(searchPath, ds)));
                if (found) {
                    const isDist = found.startsWith('dist/');
                    const dsPath = isDist ? found : `dist/${found.replace('.ts', '.js')}`;
                    console.log(`[Migration] TypeORM detectado con data-source: ${found}`);
                    return {
                        cmd: `npm run build 2>/dev/null; npx typeorm migration:run -d ${dsPath}`,
                        type: 'typeorm'
                    };
                }
                console.log('[Migration] TypeORM detectado sin data-source explícito, intentando npm run migration:run');
                return { cmd: 'npm run build 2>/dev/null; npx typeorm migration:run', type: 'typeorm' };
            }
            if (deps['sequelize-cli'] || deps.sequelize) {
                console.log('[Migration] Sequelize detectado');
                return { cmd: 'npx sequelize-cli db:migrate', type: 'sequelize' };
            }
            if (deps.knex) {
                console.log('[Migration] Knex detectado');
                return { cmd: 'npx knex migrate:latest', type: 'knex' };
            }
        } catch (e) {
            console.warn('[Migration] Error leyendo package.json:', e.message);
        }
    }

    const reqPath = path.join(searchPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
        const req = fs.readFileSync(reqPath, 'utf8').toLowerCase();
        if (req.includes('alembic')) {
            console.log('[Migration] Alembic detectado');
            return { cmd: 'alembic upgrade head', type: 'alembic' };
        }
        if (req.includes('flask-migrate') || req.includes('flask_migrate')) {
            console.log('[Migration] Flask-Migrate detectado');
            return { cmd: 'flask db upgrade', type: 'flask-migrate' };
        }
    }

    const composerPath = path.join(searchPath, 'composer.json');
    if (fs.existsSync(composerPath)) {
        try {
            const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
            const require = { ...composer.require, ...composer['require-dev'] };
            if (require['laravel/framework'] || require['laravel/laravel']) {
                console.log('[Migration] Laravel detectado');
                return { cmd: 'php artisan migrate --force', type: 'laravel' };
            }
            if (require['doctrine/migrations']) {
                console.log('[Migration] Doctrine detectado');
                return { cmd: 'php bin/console doctrine:migrations:migrate --no-interaction', type: 'doctrine' };
            }
        } catch (e) {}
    }

    if (fs.existsSync(path.join(searchPath, 'flyway.conf')) || fs.existsSync(path.join(searchPath, 'flyway.toml'))) {
        console.log('[Migration] Flyway detectado');
        return { cmd: 'flyway migrate', type: 'flyway' };
    }

    if (fs.existsSync(path.join(searchPath, 'liquibase.properties'))) {
        console.log('[Migration] Liquibase detectado');
        return { cmd: 'liquibase update', type: 'liquibase' };
    }

    console.log('[Migration] No se detectó ningún ORM con migraciones.');
    return null;
}

// Detecta la versión de Node requerida desde "engines.node" en package.json,
// limitada a las LTS con imagen oficial en Docker Hub (18/20/22). Si no hay
// package.json, no hay campo "engines.node", o no se puede parsear, cae a 20
// (la versión que ya se usaba hardcodeada antes de esta función).
function detectNodeVersion(repoPath) {
    const pkgPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return '20';
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const engines = pkg.engines?.node;
        if (!engines) return '20';
        const match = engines.match(/(\d+)/);
        if (!match) return '20';
        const major = parseInt(match[1]);
        if (major >= 22) return '22';
        if (major >= 20) return '20';
        if (major >= 18) return '18';
        return '20';
    } catch (e) {
        console.warn('[Node] Error leyendo engines.node de package.json:', e.message);
        return '20';
    }
}

// ── Detección de framework Python ──────────────────────────────

const PY_IGNORED_DIRS = new Set([
    'node_modules', '.git', 'venv', '.venv', 'env', '__pycache__',
    'site-packages', 'dist', 'build', 'tests', 'test',
]);
const PY_NAME_PRIORITY = ['app.py', 'main.py', 'server.py', 'run.py', 'wsgi.py', 'asgi.py', 'application.py'];

// Lee texto quitando BOM (UTF-8) y soportando UTF-16 (requirements generados en PowerShell)
function readTextFileSafe(filePath) {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
        return buf.subarray(2).toString('utf16le');
    }
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
        const body = Buffer.from(buf.subarray(2, buf.length - ((buf.length - 2) % 2)));
        return body.swap16().toString('utf16le');
    }
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return text;
}

// Lista los .py del repo (hasta 4 niveles), ordenados por profundidad y nombre preferido
function listPythonFiles(root) {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 4) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!PY_IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) walk(abs, depth + 1);
            } else if (e.name.endsWith('.py')) {
                out.push({ abs, rel: path.relative(root, abs).replace(/\\/g, '/'), depth, name: e.name });
            }
        }
    };
    walk(root, 0);
    out.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        const pa = PY_NAME_PRIORITY.indexOf(a.name);
        const pb = PY_NAME_PRIORITY.indexOf(b.name);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
    return out;
}

// "src/api/app.py" → "src.api.app" · "app/__init__.py" → "app"
function toPyModule(rel) {
    return rel.replace(/\.py$/, '').replace(/\//g, '.').replace(/\.__init__$/, '');
}

// Determina el puerto real a partir de una expresión de puerto en el código.
// Si la app lee PORT del entorno, se usa currentPort (el Dockerfile define ENV PORT).
function resolvePyPort(expr, currentPort) {
    if (!expr) return currentPort;
    if (/environ\[\s*['"]PORT['"]\s*\]/.test(expr)) return currentPort;
    const env = expr.match(/(?:environ\.get|getenv)\(\s*['"](\w+)['"]\s*(?:,\s*['"]?(\d+)['"]?)?/);
    if (env && env[1] === 'PORT') return currentPort;
    if (env && env[2]) return env[2];          // otra variable de entorno → se usa su default
    const literal = expr.match(/\b(\d{2,5})\b/);
    if (literal) return literal[1];
    return currentPort;
}

// Encuentra el puerto de una llamada .run(...)
// Soporta: port=5000 | port=port (variable definida en el archivo) | port=int(os.environ.get(...))
// Se toma el resto de la línea (no hasta la primera coma) para no cortar
// expresiones como int(os.environ.get('APP_PORT', 8080)).
function findRunPort(runLine, src, currentPort, frameworkDefault) {
    const portArg = runLine.match(/\bport\s*=\s*(.+)$/);
    if (!portArg) return frameworkDefault;     // .run() sin port → default del framework
    const value = portArg[1].trim();
    const ident = value.match(/^([A-Za-z_]\w*)\s*(?:,|\))/);
    if (ident) {
        const assign = src.match(new RegExp(`^\\s*${ident[1]}\\s*=\\s*(.+)$`, 'm'));
        return resolvePyPort(assign ? assign[1] : null, currentPort);
    }
    return resolvePyPort(value, currentPort);
}

// Devuelve { framework, cmd, port, extraPip } para el Dockerfile de un repo Python.
function detectPythonEntrypoint(repoPath, reqText, currentPort) {
    const req = reqText.toLowerCase();
    const has = (pkg) => new RegExp(`^\\s*${pkg.replace(/[-_]/g, '[-_]')}\\b`, 'm').test(req);
    const extraPip = [];
    const sources = listPythonFiles(repoPath).map(f => {
        let src = '';
        try { src = readTextFileSafe(f.abs); } catch { /* symlink roto / sin permisos: se ignora */ }
        return { ...f, src };
    });

    // 1. Django
    if (fs.existsSync(path.join(repoPath, 'manage.py'))) {
        const wsgi = sources.find(f => f.name === 'wsgi.py' && /get_wsgi_application/.test(f.src));
        if (wsgi) {
            if (!has('gunicorn')) extraPip.push('gunicorn');
            return {
                framework: 'django', port: currentPort, extraPip,
                cmd: ['gunicorn', `${toPyModule(wsgi.rel)}:application`, '--bind', `0.0.0.0:${currentPort}`],
            };
        }
    }

    // 2. FastAPI (admite anotación de tipo: `app: FastAPI = FastAPI(`)
    for (const f of sources) {
        const m = f.src.match(/^\s*([A-Za-z_]\w*)\s*(?::\s*[\w.]+\s*)?=\s*FastAPI\s*\(/m);
        if (m) {
            if (!has('uvicorn')) extraPip.push('uvicorn[standard]');
            return {
                framework: 'fastapi', port: currentPort, extraPip,
                cmd: ['uvicorn', `${toPyModule(f.rel)}:${m[1]}`, '--host', '0.0.0.0', '--port', String(currentPort)],
            };
        }
    }

    // 3. Flask (con o sin Socket.IO)
    for (const f of sources) {
        const m = f.src.match(/^([ \t]*)([A-Za-z_]\w*)\s*(?::\s*[\w.]+\s*)?=\s*Flask\s*\(/m);
        if (!m) continue;

        let target = `${toPyModule(f.rel)}:${m[2]}`;

        // Flask creado dentro de una factory (línea indentada) → module:create_app()
        if (m[1] !== '') {
            const factoryFile = sources.find(s => /^def\s+create_app\s*\(/m.test(s.src));
            if (factoryFile) target = `${toPyModule(factoryFile.rel)}:create_app()`;
        }

        const sio = f.src.match(/^\s*([A-Za-z_]\w*)\s*=\s*SocketIO\s*\(/m);

        if (sio) {
            const runLine = f.src.split('\n').find(l => l.includes(`${sio[1]}.run(`)) || '';
            const bindsAll = /host\s*=\s*['"]0\.0\.0\.0['"]/.test(runLine) || /host\s*=\s*os\.(environ|getenv)/.test(runLine);

            // 3a. El autor ya arranca con socketio.run en 0.0.0.0 → respetarlo
            if (runLine && bindsAll) {
                return {
                    framework: 'flask-socketio', extraPip,
                    port: findRunPort(runLine, f.src, currentPort, '5000'),
                    cmd: ['python', f.rel],
                };
            }

            // 3b. socketio.run escucha en localhost o no existe → gunicorn con worker async
            if (!has('gunicorn')) extraPip.push('gunicorn');
            const worker = has('eventlet') ? ['--worker-class', 'eventlet'] : ['--threads', '100'];
            return {
                framework: 'flask-socketio', port: currentPort, extraPip,
                cmd: ['gunicorn', ...worker, '-w', '1', '--bind', `0.0.0.0:${currentPort}`, target],
            };
        }

        // 3c. Flask sin Socket.IO → gunicorn (nunca el servidor de desarrollo)
        if (!has('gunicorn')) extraPip.push('gunicorn');
        return {
            framework: 'flask', port: currentPort, extraPip,
            cmd: ['gunicorn', '-w', '2', '--bind', `0.0.0.0:${currentPort}`, target],
        };
    }

    // 4. Script con __main__ en la raíz (app.py, main.py, server.py, run.py...)
    const script = sources.find(f =>
        f.depth === 0 &&
        PY_NAME_PRIORITY.includes(f.name) &&
        /if\s+__name__\s*==\s*['"]__main__['"]/.test(f.src)
    );
    if (script) {
        console.warn(`[Python] Framework no reconocido. Arrancando ${script.rel} directamente.`);
        return { framework: 'script', port: currentPort, extraPip, cmd: ['python', script.rel] };
    }

    // 5. Último recurso: comportamiento anterior, con uvicorn garantizado
    console.warn('[Python] No se detectó punto de entrada. Usando uvicorn main:app como último recurso.');
    if (!has('uvicorn')) extraPip.push('uvicorn[standard]');
    return {
        framework: 'unknown', port: currentPort, extraPip,
        cmd: ['uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(currentPort)],
    };
}

async function runMigrations(containerName, migrationCmd, maxWait = 30000) {
    console.log(`[Migration] Esperando que la app esté lista antes de migrar...`);

    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const info = await docker.getContainer(containerName).inspect();
            if (info.State.Running) break;
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[Migration] Corriendo: ${migrationCmd}`);

    try {
        const execInstance = await docker.getContainer(containerName).exec({
            Cmd: ['sh', '-c', migrationCmd],
            AttachStdout: true,
            AttachStderr: true,
            WorkingDir: '/app',
        });

        const output = await new Promise((resolve, reject) => {
            execInstance.start({ hijack: true }, (err, stream) => {
                if (err) return reject(err);
                let stdout = '';
                let stderr = '';
                stream.on('data', chunk => {
                    const str = chunk.toString();
                    stdout += str;
                    process.stdout.write(`[Migration] ${str}`);
                });
                stream.on('error', chunk => {
                    stderr += chunk.toString();
                });
                stream.on('end', () => resolve({ stdout, stderr }));
                setTimeout(() => resolve({ stdout, stderr: 'timeout' }), 60000);
            });
        });

        if (output.stderr && output.stderr !== 'timeout' && output.stderr.includes('error')) {
            console.warn(`[Migration] Advertencia en migración: ${output.stderr}`);
        } else {
            console.log(`[Migration] ✓ Migraciones completadas`);
        }
    } catch (err) {
        console.warn(`[Migration] Error al correr migraciones (el deploy sigue): ${err.message}`);
    }
}

// ==========================================
// --- FUNCIÓN MAESTRA DE DESPLIEGUE ---
// ==========================================
// ── Flutter / Dart ─────────────────────────────────────────────
// (usa `yaml` = js-yaml, importado en la sección de monorepos)

function readPubspec(dir) {
    const file = path.join(dir, 'pubspec.yaml');
    if (!fs.existsSync(file)) return null;
    try {
        const doc = yaml.load(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
        return doc && typeof doc === 'object' ? doc : null;
    } catch {
        return null;
    }
}

// Archivo de arranque de un servidor Dart: pubspec.executables → server.dart → main.dart → <nombre>.dart → único archivo
function detectDartEntrypoint(dir, pub) {
    const binDir = path.join(dir, 'bin');
    if (!fs.existsSync(binDir)) return null;
    const files = fs.readdirSync(binDir).filter(f => f.endsWith('.dart'));
    if (files.length === 0) return null;

    for (const [name, script] of Object.entries(pub.executables || {})) {
        const file = `${script || name}.dart`;
        if (files.includes(file)) return `bin/${file}`;
    }
    const preferred = ['server.dart', 'main.dart', `${pub.name}.dart`].find(f => files.includes(f));
    if (preferred) return `bin/${preferred}`;
    return files.length === 1 ? `bin/${files[0]}` : null;
}

// → { kind: 'flutter' | 'dart' | 'unsupported', ... } o null si no es un proyecto Dart
function detectDartProject(dir) {
    const pub = readPubspec(dir);
    if (!pub) return null;
    const deps = pub.dependencies || {};

    if (deps.flutter || pub.flutter) return { kind: 'flutter', name: pub.name };

    if (deps.dart_frog || deps.serverpod) {
        return {
            kind: 'unsupported',
            reason: 'dart_frog y Serverpod todavía no están soportados: necesitan un paso de generación de código antes de compilar.',
        };
    }

    const entry = detectDartEntrypoint(dir, pub);
    return entry ? { kind: 'dart', name: pub.name, entry } : null;
}

// Versión de Flutter fijada con FVM (.fvmrc o el formato anterior). Si no hay, usa 'stable'.
function detectFlutterVersion(dir) {
    const sources = [
        [path.join(dir, '.fvmrc'), j => j.flutter],
        [path.join(dir, '.fvm', 'fvm_config.json'), j => j.flutterSdkVersion],
    ];
    for (const [file, pick] of sources) {
        try {
            const v = String(pick(JSON.parse(fs.readFileSync(file, 'utf8'))) || '');
            if (/^\d+\.\d+\.\d+$/.test(v)) return v;
        } catch { /* sin archivo o JSON inválido */ }
    }
    return 'stable';
}

// Última versión estable de Flutter según el listado oficial de releases
async function resolveLatestStableFlutter() {
    try {
        const res = await fetch('https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json', {
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        const hash = data.current_release?.stable;
        const release = data.releases.find(r => r.hash === hash && r.channel === 'stable');
        return /^\d+\.\d+\.\d+$/.test(release?.version || '') ? release.version : null;
    } catch {
        return null;
    }
}

// → { version, source }: 'pinned' (.fvmrc), 'latest' (listado oficial) o 'fallback' (imagen de Cirrus Labs)
async function resolveFlutterVersion(dir) {
    const pinned = detectFlutterVersion(dir);
    if (pinned !== 'stable') return { version: pinned, source: 'pinned' };
    const latest = await resolveLatestStableFlutter();
    return latest ? { version: latest, source: 'latest' } : { version: 'stable', source: 'fallback' };
}

// Genera el Dockerfile de Flutter en `dir` y ejecuta `build()` dentro de la cola de Flutter.
// Si `pub get` falla porque el proyecto necesita otro Dart, reintenta una vez con la
// versión de Flutter que sugiere pub. La usan la app Flutter sola y el frontend de un monorepo.
async function buildFlutterWithRetry(dir, subdomain, build) {
    const resolved = await resolveFlutterVersion(dir);
    console.log(`[Flutter] Versión: ${resolved.version} (${resolved.source})`);
    deployLog(subdomain, 'info', `Flutter ${resolved.version} (${resolved.source === 'pinned' ? 'fijada en .fvmrc' : resolved.source === 'latest' ? 'última estable' : 'imagen de respaldo'})`);

    const attempt = async (version) => {
        writeFlutterWebDockerfile(dir, version);
        await build();
    };

    await runExclusiveFlutterBuild(subdomain, async () => {
        try {
            await attempt(resolved.version);
        } catch (e) {
            // pub get dice qué versión de Flutter incluye el Dart que el proyecto necesita
            const m = (e.buildOutput || '').match(/Try using the Flutter SDK version:\s*(\d+\.\d+\.\d+)\b/);
            if (!m || m[1] === resolved.version) throw e;
            console.log(`[Flutter] El proyecto necesita Flutter ${m[1]}; reintentando (usaba ${resolved.version})`);
            deployLog(subdomain, 'info', `El proyecto necesita Flutter ${m[1]}; reintentando...`);
            await attempt(m[1]);
        }
    });
}

// nginx de Flutter en un archivo aparte (no con echo/printf en el Dockerfile: evita problemas de escape)
const FLUTTER_NGINX_CONF = `server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;

    # Estos archivos deciden qué versión de la app carga el navegador.
    # Si se cachean, los usuarios siguen viendo la versión anterior tras un redeploy.
    location = /index.html                { add_header Cache-Control "no-cache"; }
    location = /flutter_service_worker.js { add_header Cache-Control "no-cache"; }
    location = /flutter_bootstrap.js      { add_header Cache-Control "no-cache"; }
    location = /version.json              { add_header Cache-Control "no-cache"; }
    location = /main.dart.js              { add_header Cache-Control "no-cache"; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;

// Escribe el Dockerfile de Flutter Web y devuelve su ruta
function writeFlutterWebDockerfile(dir, flutterVersion) {
    const hasWeb = fs.existsSync(path.join(dir, 'web', 'index.html'));
    if (!hasWeb) console.log('[Flutter] El proyecto no tiene web/: se agregará con "flutter create . --platforms web"');

    fs.writeFileSync(path.join(dir, 'stardest-nginx.conf'), FLUTTER_NGINX_CONF);
    if (!fs.existsSync(path.join(dir, '.dockerignore'))) {
        fs.writeFileSync(path.join(dir, '.dockerignore'), '.git\n.dart_tool\nbuild\nandroid\nios\nmacos\nlinux\nwindows\n');
    }

    // SDK desde el repositorio oficial (cualquier versión publicada). Siempre un tag concreto:
    // un clon superficial de la rama "stable" no trae tags y el SDK reportaría una versión
    // desconocida. La imagen de Cirrus Labs queda solo de respaldo (va atrasada).
    // flutterVersion siempre es "stable" o X.Y.Z validado por regex: nunca texto arbitrario del repo.
    const sdkStage = flutterVersion === 'stable'
        ? `FROM ghcr.io/cirruslabs/flutter:stable AS builder
ENV CI=true`
        : `FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git curl unzip xz-utils zip file ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PATH=/opt/flutter/bin:$PATH CI=true
RUN git config --global --add safe.directory /opt/flutter \\
 && git clone --depth 1 --branch ${flutterVersion} https://github.com/flutter/flutter.git /opt/flutter \\
 && flutter precache --web \\
 && flutter --version`;

    const dockerfile = `${sdkStage}
WORKDIR /app
RUN flutter config --no-analytics --no-cli-animations
COPY pubspec.* ./
RUN flutter pub get || true
COPY . .
${hasWeb ? '' : 'RUN flutter create . --platforms web\n'}RUN flutter pub get
RUN flutter build web --release || flutter build web --release --no-tree-shake-icons

FROM nginx:alpine
COPY stardest-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build/web /usr/share/nginx/html
EXPOSE 3000
`;
    const dockerfilePath = path.join(dir, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfile);
    console.log(`[Flutter] Dockerfile generado (Flutter ${flutterVersion})`);
    return dockerfilePath;
}

// Escribe el Dockerfile de un servidor Dart y devuelve su ruta
function writeDartServerDockerfile(dir, entry) {
    if (!fs.existsSync(path.join(dir, '.dockerignore'))) {
        fs.writeFileSync(path.join(dir, '.dockerignore'), '.git\n.dart_tool\n');
    }
    // Se copia el código fuente a la imagen final para que funcionen los archivos
    // (estáticos, plantillas) que el servidor lea en tiempo de ejecución.
    const dockerfile = `FROM dart:stable AS build
WORKDIR /app
COPY pubspec.* ./
RUN dart pub get || true
COPY . .
RUN dart pub get
RUN mkdir -p /out && dart compile exe ${entry} -o /out/server

FROM scratch
COPY --from=build /runtime/ /
COPY --from=build /app/ /app/
COPY --from=build /out/server /server
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["/server"]
`;
    const dockerfilePath = path.join(dir, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfile);
    console.log(`[Dart] Dockerfile generado (entrada: ${entry})`);
    return dockerfilePath;
}

// Flutter compila con mucha RAM: un solo build a la vez, los demás esperan en cola
let flutterBuildQueue = Promise.resolve();
let flutterQueued = 0;
function runExclusiveFlutterBuild(subdomain, task) {
    if (flutterQueued > 0) {
        console.log(`[Flutter] ${subdomain} en cola (${flutterQueued} antes)`);
        deployLog(subdomain, 'info', `Build de Flutter en cola: hay ${flutterQueued} antes`);
    }
    flutterQueued++;
    const run = flutterBuildQueue.then(task);
    flutterBuildQueue = run.catch(() => {}).finally(() => { flutterQueued--; });
    return run;
}

async function deployApp(repoUrl, subdomain, branch, userId = 'anonymous', userEmail = 'anonymous', userEnv = []) {
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
        deployLog(subdomain, 'info', `Clonando repositorio...`);
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
        deployLog(subdomain, 'info', `Rama: ${branch || 'default'}`);

        let cloneUrl = repoUrl;
        const userGithubToken = getUserToken(userId);
        if (userGithubToken) {
            try {
                const urlObj = new URL(repoUrl);
                if (urlObj.hostname === 'github.com') {
                    urlObj.username = userGithubToken;
                    cloneUrl = urlObj.toString();
                    console.log(`[Clone] Usando token de GitHub para clone privado`);
                }
            } catch (e) {}
        }

        try {
            await git.clone(cloneUrl, repoPath, cloneOptions);
        } catch (cloneError) {
            const msg = cloneError.message || '';
            const isAuthError = /Authentication failed|could not read Username|Repository not found|invalid credentials|\b403\b|\b401\b/.test(msg);

            if (isAuthError && userGithubToken) {
                console.warn(`[Clone] Token de GitHub inválido o expirado para userId ${userId}. Eliminando...`);
                deleteUserToken(userId);
                throw new Error(
                    'TOKEN_GITHUB_INVALIDO: Tu token de GitHub expiró o fue revocado. ' +
                    'Ve al Dashboard → "Repositorios privados" y vuelve a conectar tu cuenta.'
                );
            }

            throw cloneError;
        }

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
        const dartProject = detectDartProject(repoPath);
        const isFlutter = dartProject?.kind === 'flutter';
        const isDart = dartProject?.kind === 'dart';
        const hasIndexHtml = fs.existsSync(path.join(repoPath, 'index.html'));
        const hasPhpFiles = fs.readdirSync(repoPath).some(f => f.endsWith('.php'));

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
            return await deployDualService(deployPlan, subdomain, branch, repoUrl, userId, userEmail, dbType, repoPath, userEnv);
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
            const sqlSearchPath = monorepoApp ? monorepoApp.buildContext : repoPath;
            dbCredentials = await provisionDatabase(subdomain, dbType, sqlSearchPath);
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
            deployLog(subdomain, 'info', `Stack detectado: ${monorepoApp ? 'Monorepo (Dockerfile)' : 'Dockerfile propio'}`);

            const buildContext = monorepoApp ? monorepoApp.buildContext : repoPath;
            const dockerfileFullPath = monorepoApp ? monorepoApp.dockerfilePath : path.join(repoPath, 'Dockerfile');
            const dockerfileName = path.basename(dockerfileFullPath);

            // Asegurar que el Dockerfile copie el código fuente antes de buildear
            ensureDockerfileCopiesSource(dockerfileFullPath);

            const stream = await docker.buildImage(
                { context: buildContext, src: ['.'] },
                { t: imageName, dockerfile: dockerfileName }
            );
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        // Flutter/Dart van antes de Next/Node: un proyecto Flutter con package.json en la
        // raíz (p. ej. para Firebase Functions) se desplegaría como Node y fallaría.
        } else if (dartProject?.kind === 'unsupported') {
            throw new Error(dartProject.reason);

        } else if (isFlutter) {
            if (!fs.existsSync(path.join(repoPath, 'lib', 'main.dart'))) {
                throw new Error('Proyecto Flutter sin lib/main.dart: parece un paquete o plugin, no una app que se pueda desplegar.');
            }
            console.log(`Proyecto Flutter detectado. Generando Dockerfile con nginx...`);
            deployLog(subdomain, 'info', `Stack detectado: Flutter Web`);
            appPort = '3000'; // detectPort corre antes de que exista el Dockerfile generado

            await buildFlutterWithRetry(repoPath, subdomain, async () => {
                const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
                deployLog(subdomain, 'info', `Construyendo imagen Docker (Flutter puede tardar varios minutos)...`);
                await runDockerBuild(stream, subdomain);
            });

        } else if (isDart) {
            console.log(`Servidor Dart detectado (${dartProject.entry}). Generando Dockerfile...`);
            deployLog(subdomain, 'info', `Stack detectado: Dart (${dartProject.entry})`);
            writeDartServerDockerfile(repoPath, dartProject.entry);
            appPort = '3000';

            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (isNextJs) {
            console.log(`Proyecto Next.js detectado. Generando Dockerfile optimizado...`);
            deployLog(subdomain, 'info', `Stack detectado: Next.js`);
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
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (isVite) {
            console.log(`Proyecto Vite/React detectado. Generando Dockerfile con Nginx...`);
            deployLog(subdomain, 'info', `Stack detectado: Vite/React`);
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
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (isPython) {
            console.log(`Proyecto Python detectado. Escaneando código y dependencias...`);
            deployLog(subdomain, 'info', `Stack detectado: Python`);
            const reqText = readTextFileSafe(requirementsPath);
            const reqContent = reqText.toLowerCase();
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

            const entry = detectPythonEntrypoint(repoPath, reqText, appPort);
            // El puerto real puede venir del código (ej. socketio.run(..., port=5000));
            // el label de Traefik se arma más abajo leyendo appPort.
            appPort = String(entry.port);
            console.log(`[Python] Framework: ${entry.framework} → CMD ${entry.cmd.join(' ')} (puerto ${appPort})`);
            deployLog(subdomain, 'info', `Framework Python: ${entry.framework} → ${entry.cmd.join(' ')} (puerto ${appPort})`);

            const pipExtra = entry.extraPip.length
                ? `RUN pip install --no-cache-dir ${entry.extraPip.map(p => `"${p}"`).join(' ')}\n`
                : '';

            const reqRelativePath = path.relative(repoPath, requirementsPath).replace(/\\/g, '/');
            const dockerfile = `FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=${appPort}
${aptGetCommand}COPY ${reqRelativePath} ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
${pipExtra}COPY . .
EXPOSE ${appPort}
CMD ${JSON.stringify(entry.cmd)}
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log(`Dockerfile de Python (${entry.framework}) generado exitosamente.`);
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (isNode) {
            console.log(`Proyecto Node.js detectado. Generando Dockerfile estándar...`);
            deployLog(subdomain, 'info', `Stack detectado: Node.js`);
            const nodeVersion = detectNodeVersion(repoPath);
            console.log(`[Node] Versión de imagen seleccionada: node:${nodeVersion}-slim`);
            const dockerfile = `FROM node:${nodeVersion}-slim
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
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (hasIndexHtml) {
            console.log(`Sitio estático detectado (index.html). Generando Dockerfile con Nginx...`);
            deployLog(subdomain, 'info', `Stack detectado: Sitio estático`);
            const dockerfile = `FROM nginx:alpine
RUN printf 'server {\\nlisten ${appPort};\\nroot /usr/share/nginx/html;\\nindex index.html;\\nlocation / {\\ntry_files $uri $uri/ /index.html;\\n}\\n}\\n' > /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE ${appPort}
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile estático de Nginx generado exitosamente.');
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else if (hasPhpFiles) {
            console.log('Proyecto PHP plano detectado. Generando Dockerfile con Apache...');
            deployLog(subdomain, 'info', `Stack detectado: PHP`);
            const dockerfile = `FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_mysql mysqli
RUN sed -i "s/80/${appPort}/g" /etc/apache2/ports.conf /etc/apache2/sites-enabled/000-default.conf
COPY . /var/www/html/
EXPOSE ${appPort}
`;
            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log('Dockerfile PHP/Apache generado exitosamente.');
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            deployLog(subdomain, 'info', `Construyendo imagen Docker...`);
            await runDockerBuild(stream, subdomain);

        } else {
            console.log(`No hay Dockerfile, Next.js, Vite ni Python. Usando Buildpacks...`);
            deployLog(subdomain, 'info', `Stack detectado: Buildpacks (fallback)`);
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

            deployLog(subdomain, 'info', `Construyendo con Buildpacks...`);
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
                packProcess.stdout.on('data', chunk => {
                    const msg = chunk.toString().trim();
                    if (msg) deployLog(subdomain, 'build', msg);
                });
                packProcess.stderr.on('data', chunk => {
                    const msg = chunk.toString().trim();
                    if (msg) deployLog(subdomain, 'build', msg);
                });
            });
        }

        console.log(`Limpiando versiones anteriores...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }

        console.log(`Lanzando contenedor en la red de Traefik...`);
        deployLog(subdomain, 'info', `Lanzando contenedor...`);

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

        // Dominios personalizados vinculados a este subdominio: un router de
        // Traefik por dominio, con TLS/Let's Encrypt, apuntando al mismo
        // service que ya expone el router de {subdomain}.stardest.com.
        const customDomains = readCustomDomains();
        const userCustomDomains = Object.entries(customDomains)
            .filter(([, v]) => v.subdomain === subdomain)
            .map(([domain]) => domain);

        const customDomainLabels = {};
        userCustomDomains.forEach((domain, i) => {
            const routerName = `${subdomain}-custom-${i}`;
            customDomainLabels[`traefik.http.routers.${routerName}.rule`]             = `Host(\`${domain}\`)`;
            customDomainLabels[`traefik.http.routers.${routerName}.entrypoints`]      = 'websecure';
            customDomainLabels[`traefik.http.routers.${routerName}.tls`]              = 'true';
            customDomainLabels[`traefik.http.routers.${routerName}.tls.certresolver`] = 'letsencrypt';
            customDomainLabels[`traefik.http.routers.${routerName}.service`]          = subdomain;
            customDomainLabels[`traefik.http.routers.${routerName}.priority`]         = '20';
        });

        const cleanUserEnv = sanitizeUserEnv(userEnv);
        const container = await docker.createContainer({
            Image: imageName,
            name: `container-${subdomain}`,
            Env: [...dbEnv, ...cleanUserEnv],
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
                "deploy.userEnv": JSON.stringify(cleanUserEnv),
                ...(dbCredentials ? {
                    "deploy.db.type":       dbCredentials.dbType,
                    "deploy.db.host":       dbCredentials.dbHost,
                    "deploy.db.port":       dbCredentials.dbPort,
                    "deploy.db.name":       dbCredentials.dbName,
                    "deploy.db.user":       dbCredentials.dbUser,
                    "deploy.db.password":   dbCredentials.dbPassword,
                    "deploy.db.adminerUrl": dbCredentials.adminerUrl,
                } : {}),
                ...customDomainLabels,
            },
            HostConfig: {
                NetworkMode: "deploys_internal_network",
                RestartPolicy: { Name: "always" },
                Privileged: true
            }
        });

        await container.start();

        // Correr migraciones si el repo tiene ORM
        const migrationSearchPath = monorepoApp ? monorepoApp.buildContext : repoPath;
        const migrationCmd = detectMigrationCommand(repoPath, migrationSearchPath);
        if (migrationCmd && dbCredentials) {
            await runMigrations(`container-${subdomain}`, migrationCmd.cmd);
        }

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

// 1a. Stream de logs en tiempo real (SSE) para un deploy en curso.
// requireAuth: los logs de build pueden filtrar detalles del repo/errores,
// así que solo el usuario autenticado que dispara el deploy puede escucharlos
// (EventSource no puede mandar headers custom, pero sí manda la cookie
// auth_token automáticamente en same-origin, así que requireAuth funciona igual).
app.get('/deploy-logs/:subdomain', requireAuth, (req, res) => {
    const { subdomain } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desactivar buffering en nginx/traefik
    res.flushHeaders();

    if (!deployLogClients.has(subdomain)) {
        deployLogClients.set(subdomain, new Set());
    }
    deployLogClients.get(subdomain).add(res);

    // Ping cada 15s para mantener la conexión viva (Cloudflare corta SSE idle)
    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) {}
    }, 15000);

    req.on('close', () => {
        clearInterval(ping);
        const clients = deployLogClients.get(subdomain);
        if (clients) {
            clients.delete(res);
            if (clients.size === 0) deployLogClients.delete(subdomain);
        }
    });
});

// 1. Despliegue Manual
app.post('/deploy', requireAuth, async (req, res) => {
    const { repoUrl, subdomain, branch, env } = req.body;
    if (!repoUrl || !subdomain) return res.status(400).send("Faltan datos: repoUrl o subdomain");

    const userId = req.user.id || 'anonymous';
    const userEmail = req.user.email || 'anonymous';
    const userEnv = sanitizeUserEnv(env);

    const actualBranch = branch || 'main';

    // Pausa de mantenimiento desde la Console: el admin sí puede desplegar
    if (deploysPaused && !isAdminUser(req.user)) {
        return res.status(503).json({
            status: 'error',
            code: 'MAINTENANCE',
            details: 'StarDest está en mantenimiento. Intenta de nuevo en unos minutos.',
        });
    }

    const activeDeployCount = await countActiveDeploys(userId, subdomain);
    if (activeDeployCount >= MAX_DEPLOYS_PER_USER) {
        logger.warn({
            event: 'deploy_limit_reached',
            userId: req.user?.id,
            subdomain,
            current: activeDeployCount,
            ip: getIP(req)
        }, 'Deploy bloqueado por límite de proyectos activos');
        return res.status(403).json({
            status: 'error',
            code: 'DEPLOY_LIMIT_REACHED',
            details: `Alcanzaste el límite de ${MAX_DEPLOYS_PER_USER} proyectos activos. Elimina uno desde el Dashboard antes de desplegar uno nuevo.`,
            current: activeDeployCount,
            max: MAX_DEPLOYS_PER_USER,
        });
    }

    const rateCheck = canDeploy(userId);
    if (!rateCheck.allowed) {
        logger.warn({
            event: 'deploy_rate_limited',
            userId: req.user?.id,
            subdomain,
            code: rateCheck.code,
            ip: getIP(req)
        }, 'Deploy bloqueado por rate limit');
        return res.status(429).json({ status: 'error', code: rateCheck.code, details: rateCheck.reason });
    }

    logger.info({
        event: 'deploy_start',
        userId: req.user?.id,
        subdomain,
        repoUrl,
        branch: branch || 'default',
        ip: getIP(req)
    }, 'Deploy iniciado');
    recordDeployEvent('start', { subdomain, userId, userEmail, repoUrl, branch: actualBranch });

    startDeployTracking(userId);
    try {
        const url = await deployApp(repoUrl, subdomain, actualBranch, userId, userEmail, userEnv);
        saveDeployment(repoUrl, actualBranch, subdomain);
        logger.info({
            event: 'deploy_success',
            userId: req.user?.id,
            subdomain,
            ip: getIP(req)
        }, 'Deploy completado');
        recordDeployEvent('success', { subdomain, userId, userEmail, repoUrl });
        emitDeployLog(subdomain, { type: 'done', url, ts: Date.now() });
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
        recordDeployEvent('error', { subdomain, userId, userEmail, repoUrl, error: error.message });
        emitDeployLog(subdomain, { type: 'fail', message: error.message, ts: Date.now() });
        res.status(500).json({ status: 'error', details: error.message });
    } finally {
        endDeployTracking(userId);
    }
});

// GET /deploy-quota — estado del rate limit del usuario autenticado
app.get('/deploy-quota', requireAuth, (req, res) => {
    const userId = req.user.id;
    const now = Date.now();
    const history = (deployHistory.get(userId) || []).filter(t => now - t < ONE_HOUR_MS);
    const concurrent = deployInProgress.get(userId) || 0;

    res.json({
        concurrent,
        hourly: history.length,
        maxConcurrent: MAX_CONCURRENT_DEPLOYS,
        maxHourly: MAX_DEPLOYS_PER_HOUR,
    });
});

// 1b. Listar ramas de un repositorio de GitHub (proxy server-side para evitar
// problemas de CORS/conectividad del navegador hacia api.github.com).
// Si el usuario tiene un token de GitHub guardado, se usa para poder listar
// ramas de repos privados a los que tenga acceso.
app.get('/github/branches', requireAuth, async (req, res) => {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
        return res.status(400).json({ status: 'error', message: 'Faltan owner o repo' });
    }
    const githubToken = getUserToken(req.user.id);
    try {
        const ghRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, {
            headers: {
                'User-Agent': 'StarDest',
                ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
            }
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

// 1c. Listar los repositorios personales del usuario autenticado (para el panel
// de repos en el Dashboard). Usa el token de GitHub guardado si existe para
// incluir repos privados; si no, cae a la API pública con el username del
// login de GitHub (solo disponible si el usuario inició sesión con GitHub).
app.get('/github-repos', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const userLogin = req.user.username;
    const githubToken = getUserToken(userId);

    if (!githubToken && !userLogin) {
        return res.json({ repos: [], hasToken: false });
    }

    try {
        let repos = [];
        const headers = {
            'User-Agent': 'StarDest',
            Accept: 'application/vnd.github.v3+json',
            ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
        };

        // Paginar para obtener todos los repos (GitHub devuelve máx 100 por página)
        let page = 1;
        while (true) {
            const url = githubToken
                ? `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner&sort=pushed`
                : `https://api.github.com/users/${encodeURIComponent(userLogin)}/repos?per_page=100&page=${page}&sort=pushed`;

            const ghRes = await fetch(url, { headers });
            if (!ghRes.ok) break;

            const batch = await ghRes.json();
            if (!Array.isArray(batch) || batch.length === 0) break;

            // Filtrar solo repos del propio usuario (no de organizaciones)
            repos = repos.concat(batch.filter(r => r.owner.type === 'User'));

            if (batch.length < 100) break; // última página
            page++;
        }

        const formatted = repos.map(r => ({
            id:            r.id,
            name:          r.name,
            fullName:      r.full_name,
            url:           r.html_url,
            description:   r.description || '',
            private:       r.private,
            language:      r.language || null,
            pushedAt:      r.pushed_at,
            defaultBranch: r.default_branch,
            stars:         r.stargazers_count,
        }));

        res.json({ repos: formatted, hasToken: !!githubToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1d. Listar las organizaciones del usuario autenticado. Con token guardado
// incluye organizaciones privadas; sin token, solo las públicas (requiere
// que el usuario haya iniciado sesión con GitHub para conocer su username).
app.get('/github-orgs', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const userLogin = req.user.username;
    const githubToken = getUserToken(userId);

    if (!githubToken && !userLogin) {
        return res.json({ orgs: [], hasToken: false });
    }

    const headers = {
        'User-Agent': 'StarDest',
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
    };

    try {
        // Con token: /user/orgs devuelve todas (públicas + privadas)
        // Sin token: /users/:login/orgs devuelve solo públicas
        const url = githubToken
            ? 'https://api.github.com/user/orgs?per_page=100'
            : `https://api.github.com/users/${encodeURIComponent(userLogin)}/orgs?per_page=100`;

        const orgsRes = await fetch(url, { headers });
        if (!orgsRes.ok) return res.status(orgsRes.status).json({ error: `GitHub API error: ${orgsRes.status}` });

        const orgs = await orgsRes.json();

        // Para cada org, obtener info detallada (avatar, descripción, etc.)
        const detailed = await Promise.all(orgs.map(async org => {
            try {
                const orgRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org.login)}`, { headers });
                if (!orgRes.ok) {
                    return { login: org.login, name: org.login, avatarUrl: org.avatar_url, description: '', publicRepos: 0, url: `https://github.com/${org.login}` };
                }
                const orgData = await orgRes.json();
                return {
                    login:       orgData.login,
                    name:        orgData.name || orgData.login,
                    avatarUrl:   orgData.avatar_url,
                    description: orgData.description || '',
                    publicRepos: orgData.public_repos || 0,
                    url:         orgData.html_url,
                };
            } catch (e) {
                return { login: org.login, name: org.login, avatarUrl: org.avatar_url, description: '', publicRepos: 0, url: `https://github.com/${org.login}` };
            }
        }));

        res.json({ orgs: detailed, hasToken: !!githubToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1e. Listar los repos de una organización específica.
app.get('/github-org-repos', requireAuth, async (req, res) => {
    const { org } = req.query;
    if (!org || !/^[a-zA-Z0-9._-]+$/.test(org)) {
        return res.status(400).json({ error: 'Nombre de organización inválido' });
    }

    const githubToken = getUserToken(req.user.id);
    const headers = {
        'User-Agent': 'StarDest',
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken ? { Authorization: `token ${githubToken}` } : {})
    };

    try {
        let repos = [];
        let page = 1;
        while (true) {
            const url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}&sort=pushed&type=all`;
            const ghRes = await fetch(url, { headers });
            if (!ghRes.ok) break;

            const batch = await ghRes.json();
            if (!Array.isArray(batch) || batch.length === 0) break;

            repos = repos.concat(batch);
            if (batch.length < 100) break;
            page++;
        }

        const formatted = repos.map(r => ({
            id:            r.id,
            name:          r.name,
            fullName:      r.full_name,
            url:           r.html_url,
            description:   r.description || '',
            private:       r.private,
            language:      r.language || null,
            pushedAt:      r.pushed_at,
            defaultBranch: r.default_branch,
            stars:         r.stargazers_count,
        }));

        res.json({ repos: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// --- WEBHOOK DE GITHUB (push → redeploy, firmado) ---
// ==========================================
// Un secreto HMAC por deploy, guardado en un archivo persistente (no en labels de
// Docker: no aparece en `docker inspect` y se puede generar para deploys existentes).
// (misma base que DEPLOYS_DIR, que se declara más abajo en el archivo)
const WEBHOOKS_DIR = path.join(process.env.DEPLOYS_DIR || path.join(__dirname, '..', '..'), 'webhooks');
const WEBHOOK_SECRETS_FILE = path.join(WEBHOOKS_DIR, 'secrets.json');

function readWebhookSecrets() {
    try {
        return JSON.parse(fs.readFileSync(WEBHOOK_SECRETS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function writeWebhookSecrets(data) {
    fs.mkdirSync(WEBHOOKS_DIR, { recursive: true });
    const tmp = `${WEBHOOK_SECRETS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, WEBHOOK_SECRETS_FILE);
}

function getOrCreateWebhookSecret(subdomain, { rotate = false } = {}) {
    const all = readWebhookSecrets();
    if (!all[subdomain] || rotate) {
        all[subdomain] = { secret: crypto.randomBytes(24).toString('hex'), createdAt: new Date().toISOString() };
        writeWebhookSecrets(all);
    }
    return all[subdomain].secret;
}

function deleteWebhookSecret(subdomain) {
    const all = readWebhookSecrets();
    if (all[subdomain]) {
        delete all[subdomain];
        writeWebhookSecrets(all);
    }
}

// Comparación en tiempo constante para no filtrar información por tiempos de respuesta
function verifyGithubSignature(rawBody, header, secret) {
    if (!rawBody || !header || !String(header).startsWith('sha256=')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(String(header));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const webhookRunning = new Set();  // subdominios construyéndose por webhook
const webhookPending = new Set();  // subdominios con otro push en cola

// Un push que llega mientras se construye ese mismo deploy se encola y corre al terminar
async function runWebhookRedeploy(job) {
    const { subdomain } = job;
    if (webhookRunning.has(subdomain)) {
        webhookPending.add(subdomain);
        console.log(`[Webhook] ${subdomain} ya se está construyendo; el push queda en cola`);
        return;
    }
    webhookRunning.add(subdomain);
    try {
        if (deploysPaused) {
            console.log(`[Webhook] Deploys en pausa — se descarta el push encolado de ${subdomain}`);
            return;
        }
        recordDeployEvent('webhook', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, branch: job.branch });
        // Conserva dueño y variables de entorno del contenedor actual
        await deployApp(job.repoUrl, subdomain, job.branch, job.userId, job.userEmail, job.userEnv);
        recordDeployEvent('success', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, source: 'webhook' });
        console.log(`[Webhook] ${subdomain} actualizado con éxito`);
    } catch (e) {
        recordDeployEvent('error', { subdomain, userId: job.userId, userEmail: job.userEmail, repoUrl: job.repoUrl, error: e.message, source: 'webhook' });
        console.error(`[Webhook] Error actualizando ${subdomain}: ${e.message}`);
    } finally {
        webhookRunning.delete(subdomain);
        if (webhookPending.delete(subdomain)) runWebhookRedeploy(job); // hubo otro push durante el build
    }
}

app.post('/webhook', async (req, res) => {
    const event = req.headers['x-github-event'];
    if (event === 'ping') return res.status(200).send('pong');
    if (event !== 'push') return res.status(200).send('Evento ignorado');

    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !req.rawBody) return res.status(401).send('Firma requerida');

    // Soporta content type JSON y form-urlencoded (payload=<json>)
    let payload = req.body;
    try {
        if (typeof req.body?.payload === 'string') payload = JSON.parse(req.body.payload);
    } catch {
        return res.status(400).send('Payload inválido');
    }

    const repoUrl = payload?.repository?.html_url;
    const branch = String(payload?.ref || '').replace('refs/heads/', '');
    if (!repoUrl || !branch) return res.status(400).send('Payload incompleto');

    try {
        // Todos los deploys de este repo y rama (un mismo repo puede estar en varios subdominios)
        const containers = await docker.listContainers({ all: true });
        const candidates = new Map();
        for (const c of containers) {
            const name = c.Names[0].slice(1);
            if (!name.startsWith('container-')) continue;
            const L = c.Labels;
            if (!L['deploy.repo'] || normalizeUrl(L['deploy.repo']) !== normalizeUrl(repoUrl)) continue;
            if ((L['deploy.branch'] || 'main') !== branch) continue;
            const sub = L['deploy.subdomain'] || name.replace(/^container-/, '').replace(/-(backend|frontend)$/, '');
            if (candidates.has(sub)) continue;
            let userEnv = [];
            try { userEnv = JSON.parse(L['deploy.userEnv'] || '[]'); } catch { userEnv = []; }
            candidates.set(sub, {
                subdomain: sub,
                repoUrl: L['deploy.repo'],
                branch,
                userId: L['deploy.userId'] || 'anonymous',
                userEmail: L['deploy.userEmail'] || 'anonymous',
                userEnv,
            });
        }

        // La firma decide qué deploy(s) disparar: cada webhook firma con el secreto de su subdominio
        const secrets = readWebhookSecrets();
        const matched = [...candidates.values()].filter(job =>
            secrets[job.subdomain] && verifyGithubSignature(req.rawBody, signature, secrets[job.subdomain].secret));

        if (matched.length === 0) {
            console.warn(`[Webhook] Push rechazado para ${repoUrl}#${branch} (firma inválida o deploy inexistente)`);
            return res.status(401).send('Firma inválida o deploy no encontrado');
        }

        // 503 para que el push aparezca como fallido en "Recent Deliveries" de GitHub
        if (deploysPaused) {
            console.log(`[Webhook] Deploys en pausa — se ignora el push de ${matched.map(j => j.subdomain).join(', ')}`);
            return res.status(503).send('Deploys en pausa (mantenimiento)');
        }

        res.status(202).send(`Redeploy iniciado: ${matched.map(j => j.subdomain).join(', ')}`);
        for (const job of matched) runWebhookRedeploy(job);
    } catch (e) {
        console.error('[Webhook] Error:', e.message);
        if (!res.headersSent) res.status(500).send('Error interno');
    }
});

async function findOwnedDeploy(subdomain, user) {
    const containers = await docker.listContainers({ all: true });
    const names = [`/container-${subdomain}`, `/container-${subdomain}-backend`, `/container-${subdomain}-frontend`];
    return containers.find(c =>
        c.Names.some(n => names.includes(n)) && c.Labels['deploy.userId'] === String(user.id));
}

// Ver (o crear) el secreto del webhook de un deploy propio
app.get('/deploys/:subdomain/webhook', requireAuth, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    try {
        if (!(await findOwnedDeploy(subdomain, req.user))) return res.status(404).json({ error: 'Deploy no encontrado' });
        res.json({
            url: `${process.env.FRONTEND_URL || 'https://stardest.com'}/webhook`,
            secret: getOrCreateWebhookSecret(subdomain),
            contentType: 'application/json',
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Generar un secreto nuevo (el anterior deja de servir)
app.post('/deploys/:subdomain/webhook/rotate', requireAuth, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    try {
        if (!(await findOwnedDeploy(subdomain, req.user))) return res.status(404).json({ error: 'Deploy no encontrado' });
        res.json({ secret: getOrCreateWebhookSecret(subdomain, { rotate: true }) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Elimina todos los contenedores de un deploy (app, backend/frontend, DB y Adminer).
// No valida dueño: eso lo hace cada endpoint que la llama.
async function removeDeployContainers(subdomain, containers) {
    const list = containers || await docker.listContainers({ all: true });
    const names = [
        `/container-${subdomain}`,
        `/container-${subdomain}-backend`,
        `/container-${subdomain}-frontend`,
        `/db-${subdomain}`,
        `/adminer-${subdomain}`,
    ];
    const removed = [];
    for (const n of names) {
        const c = list.find(x => x.Names.includes(n));
        if (c) {
            await docker.getContainer(c.Id).remove({ force: true });
            console.log(`Contenedor ${n} eliminado.`);
            removed.push(n.slice(1));
        }
    }
    // Si alguien crea después un deploy con el mismo subdominio, no hereda el secreto
    deleteWebhookSecret(subdomain);
    return removed;
}

// 3. Borrar Proyecto (solo el dueño)
app.delete('/deploy/:subdomain', requireAuth, async (req, res) => {
    const { subdomain } = req.params;
    if (!subdomain) return res.status(400).json({ status: 'error', message: "Falta el subdominio" });
    try {
        console.log(`Solicitud para eliminar el proyecto: ${subdomain}`);
        const containers = await docker.listContainers({ all: true });

        // El dueño se toma del label deploy.userId del contenedor de la app. Si no
        // es del usuario (o no existe), se responde igual que "no encontrado" para
        // no revelar qué subdominios existen.
        const appNames = [`/container-${subdomain}`, `/container-${subdomain}-backend`, `/container-${subdomain}-frontend`];
        const appContainer = containers.find(c => c.Names.some(n => appNames.includes(n)));
        if (!appContainer || appContainer.Labels['deploy.userId'] !== String(req.user.id)) {
            return res.status(404).json({ status: 'warning', message: `No se encontró el proyecto.` });
        }

        const removed = await removeDeployContainers(subdomain, containers);

        if (removed.length) {
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
        const allCustomDomains = readCustomDomains();
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
                    database: null,
                    customDomains: Object.entries(allCustomDomains)
                        .filter(([, v]) => v.subdomain === subdomain)
                        .map(([domain]) => ({ domain })),
                    userEnv: (() => {
                        try { return JSON.parse(labels['deploy.userEnv'] || '[]'); }
                        catch (e) { return []; }
                    })(),
                };
            }

            grouped[subdomain].roles.push(labels['deploy.role'] || 'app');
            // Si cualquiera de los componentes no está 'running', reflejarlo
            if (c.State !== 'running') grouped[subdomain].status = c.State;

            // Actualizar database en cada iteración, sin importar el orden de los contenedores
            if (labels['deploy.db.type'] && !grouped[subdomain].database) {
                grouped[subdomain].database = {
                    type:       labels['deploy.db.type'],
                    host:       labels['deploy.db.host'],
                    port:       labels['deploy.db.port'],
                    name:       labels['deploy.db.name'],
                    user:       labels['deploy.db.user'],
                    password:   labels['deploy.db.password'],
                    adminerUrl: labels['deploy.db.adminerUrl'] || null,
                };
            }

            // Mantener el deployedAt más reciente entre los componentes del grupo
            if (labels['deploy.timestamp'] && labels['deploy.timestamp'] > grouped[subdomain].deployedAt) {
                grouped[subdomain].deployedAt = labels['deploy.timestamp'];
            }
        }

        res.json({ status: 'success', deploys: Object.values(grouped) });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

// Dominios personalizados por deploy
const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// POST /custom-domain — vincular un dominio propio a un subdominio ya desplegado
app.post('/custom-domain', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { subdomain, domain } = req.body;
    if (!subdomain || !domain) return res.status(400).json({ ok: false, error: 'Faltan campos' });

    if (!domainRegex.test(domain)) {
        return res.status(400).json({ ok: false, error: 'Dominio inválido' });
    }

    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c =>
        (c.Names.includes(`/container-${subdomain}`) ||
         c.Names.includes(`/container-${subdomain}-frontend`)) &&
        c.Labels['deploy.userId'] === userId
    );
    if (!container) {
        return res.status(404).json({ ok: false, error: 'Deploy no encontrado o no es tuyo' });
    }

    const domains = readCustomDomains();
    if (domains[domain] && domains[domain].userId !== userId) {
        return res.status(409).json({ ok: false, error: 'Ese dominio ya está en uso' });
    }
    domains[domain] = { subdomain, userId, addedAt: new Date().toISOString() };
    writeCustomDomains(domains);

    console.log(`[Domain] Registrado: ${domain} -> ${subdomain}`);

    res.json({ ok: true, domain, subdomain, cname: `${subdomain}.stardest.com` });
});

// GET /custom-domains — dominios del usuario autenticado
app.get('/custom-domains', requireAuth, (req, res) => {
    const domains = readCustomDomains();
    const userDomains = Object.entries(domains)
        .filter(([, v]) => v.userId === req.user.id)
        .map(([domain, v]) => ({ domain, subdomain: v.subdomain, addedAt: v.addedAt }));

    res.json({ domains: userDomains });
});

// DELETE /custom-domain/:domain
app.delete('/custom-domain/:domain', requireAuth, (req, res) => {
    const { domain } = req.params;
    const domains = readCustomDomains();
    if (!domains[domain] || domains[domain].userId !== req.user.id) {
        return res.status(404).json({ ok: false, error: 'Dominio no encontrado' });
    }
    delete domains[domain];
    writeCustomDomains(domains);
    res.json({ ok: true });
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

// ==========================================
// --- STARDEST CONSOLE (solo admin) ---
// ==========================================
const { authenticator } = require('otplib');
authenticator.options = { window: 1 }; // tolera ±30 s de desfase de reloj

const ADMIN_GITHUB_IDS = (process.env.ADMIN_GITHUB_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || '';
const ADMIN_SESSION_TTL = 30 * 60; // segundos

// Contenedores sobre los que la Console puede ACTUAR (solo los de usuarios)
const MANAGED_CONTAINER = /^(container|db|adminer)-[a-z0-9][a-z0-9-]*$/;
// Contenedores del sistema: solo LECTURA de logs, nunca detener/eliminar.
// Cada uno se busca por nombre de contenedor o por servicio de docker compose,
// porque el compose del servidor no está en el repo y el nombre real puede variar.
const SYSTEM_SERVICES = {
    deploy_panel:  ['deploy_panel'],
    traefik:       ['traefik'],
    static_server: ['static_server'],
    cloudflared:   ['cloudflared'],
    frontend:      ['stardest_web', 'web_frontend'],
};

// ── Estado en memoria (se reinicia si el panel se reinicia) ──
let deploysPaused = false;
const deployEvents = [];      // últimos 200 eventos de deploy
const adminAudit = [];        // últimas 200 acciones del admin
const totpState = new Map();  // userId → { fails, lockedUntil, lastCode, lastCodeAt }

function pushCapped(list, item, max = 200) {
    list.unshift(item);
    if (list.length > max) list.length = max;
}

function recordDeployEvent(type, data) {
    pushCapped(deployEvents, { ts: Date.now(), type, ...data });
}

function audit(req, action, target = '') {
    const ip = getIP(req);
    pushCapped(adminAudit, { ts: Date.now(), action, target, ip });
    logger.info({ event: 'admin_action', action, target, ip }, `[Admin] ${action} ${target}`);
}

// La sesión de StarDest viaja en la cookie httpOnly auth_token (igual que requireAuth)
function getRequestUser(req) {
    const token = req.cookies?.auth_token;
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret');
    } catch {
        return null;
    }
}

// Se identifica por el ID numérico de GitHub (inmutable), no por el username,
// y solo si entró con GitHub: la misma persona logueada con Google no es admin.
function isAdminUser(user) {
    return !!user
        && user.provider === 'github'
        && ADMIN_GITHUB_IDS.includes(String(user.id));
}

// ── Middlewares ──
// Para cualquiera que no sea admin, /admin/* responde 404 (no revela que existe)
function requireAdmin(req, res, next) {
    const user = getRequestUser(req);
    if (!isAdminUser(user)) return res.status(404).json({ error: 'Not found' });
    req.adminUser = user;
    next();
}

function requireAdminSession(req, res, next) {
    if (!ADMIN_SESSION_SECRET) return res.status(503).json({ error: 'Console no configurada' });
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ error: 'Código TOTP requerido', code: 'TOTP_REQUIRED' });
    try {
        const payload = jwt.verify(token, ADMIN_SESSION_SECRET);
        if (payload.scope !== 'admin' || String(payload.sub) !== String(req.adminUser.id)) throw new Error('scope');
        next();
    } catch {
        return res.status(401).json({ error: 'Sesión de consola expirada', code: 'TOTP_REQUIRED' });
    }
}

const adminOnly = [requireAdmin, requireAdminSession];

// ── Helpers de monitoreo ──
function readMeminfo() {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => Number((txt.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1] || 0) * 1024;
    return {
        total: get('MemTotal'), available: get('MemAvailable'),
        swapTotal: get('SwapTotal'), swapFree: get('SwapFree'),
    };
}

async function sampleCpuPercent(ms = 400) {
    const a = os.cpus();
    await new Promise(r => setTimeout(r, ms));
    const b = os.cpus();
    let idle = 0, total = 0;
    b.forEach((cpu, i) => {
        const d = (k) => cpu.times[k] - a[i].times[k];
        const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
        total += t;
        idle += d('idle');
    });
    return total ? Math.round((1 - idle / total) * 1000) / 10 : 0;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// Los logs de Docker sin TTY vienen multiplexados (cabecera de 8 bytes por bloque)
function demuxDockerLogs(buf) {
    if (!Buffer.isBuffer(buf)) return String(buf || '');
    const multiplexed = buf.length >= 8 && [0, 1, 2].includes(buf[0]) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
    if (!multiplexed) return buf.toString('utf8');
    let out = '';
    let i = 0;
    while (i + 8 <= buf.length) {
        const size = buf.readUInt32BE(i + 4);
        out += buf.subarray(i + 8, i + 8 + size).toString('utf8');
        i += 8 + size;
    }
    return out;
}

async function checkHttp(url, isOk = (r) => r.ok) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
        return isOk(r) ? 'ok' : 'down';
    } catch (e) {
        const code = String(e.cause?.code || e.message);
        return /ENOTFOUND|EAI_AGAIN/.test(code) ? 'unknown' : 'down';
    }
}

function findSystemContainer(containers, key) {
    const aliases = SYSTEM_SERVICES[key] || [];
    return containers.find(c =>
        c.Names.some(n => aliases.includes(n.slice(1))) ||
        aliases.includes(c.Labels?.['com.docker.compose.service']));
}

// ── TOTP ──
app.post('/admin/totp/verify', requireAdmin, (req, res) => {
    if (!ADMIN_TOTP_SECRET || !ADMIN_SESSION_SECRET) {
        return res.status(503).json({ error: 'La consola no está configurada en el servidor' });
    }
    const id = String(req.adminUser.id);
    const now = Date.now();
    const state = totpState.get(id) || { fails: 0, lockedUntil: 0, lastCode: null, lastCodeAt: 0 };

    if (state.lockedUntil > now) {
        const min = Math.ceil((state.lockedUntil - now) / 60000);
        return res.status(429).json({ error: `Demasiados intentos. Espera ${min} min.` });
    }

    const code = String(req.body?.code || '').replace(/\s/g, '');
    if (code && code === state.lastCode && now - state.lastCodeAt < 90000) {
        return res.status(401).json({ error: 'Ese código ya se usó. Espera el siguiente.' });
    }

    let valid = false;
    try {
        valid = /^\d{6}$/.test(code) && authenticator.verify({ token: code, secret: ADMIN_TOTP_SECRET });
    } catch {
        valid = false;
    }

    if (!valid) {
        state.fails += 1;
        if (state.fails >= 5) {
            state.fails = 0;
            state.lockedUntil = now + 15 * 60 * 1000;
        }
        totpState.set(id, state);
        audit(req, 'totp_fail');
        return res.status(401).json({ error: 'Código incorrecto' });
    }

    totpState.set(id, { fails: 0, lockedUntil: 0, lastCode: code, lastCodeAt: now });
    audit(req, 'totp_ok');
    const adminToken = jwt.sign({ sub: id, scope: 'admin' }, ADMIN_SESSION_SECRET, { expiresIn: ADMIN_SESSION_TTL });
    res.json({ adminToken, expiresIn: ADMIN_SESSION_TTL });
});

// ── Monitoreo: servidor + plataforma ──
app.get('/admin/overview', ...adminOnly, async (req, res) => {
    try {
        const [cpu, info, containers, disk] = await Promise.all([
            sampleCpuPercent(),
            docker.info(),
            docker.listContainers({ all: true }),
            fs.promises.statfs(DEPLOYS_DIR).catch(() => null),
        ]);

        const appContainers = containers.filter(c => c.Names.some(n => n.startsWith('/container-')));
        const subdomains = new Set(appContainers.map(c =>
            c.Labels['deploy.subdomain'] || c.Names[0].replace('/container-', '').replace(/-(backend|frontend)$/, '')));
        const users = new Set(appContainers
            .map(c => c.Labels['deploy.userId'])
            .filter(u => u && u !== 'anonymous' && u !== 'unknown'));
        const mem = readMeminfo();

        res.json({
            host: {
                cpuPercent: cpu,
                cores: os.cpus().length,
                load: os.loadavg(),
                uptime: os.uptime(),
                memory: { total: mem.total, used: mem.total - mem.available },
                swap: { total: mem.swapTotal, used: mem.swapTotal - mem.swapFree },
                disk: disk ? { total: disk.blocks * disk.bsize, used: (disk.blocks - disk.bfree) * disk.bsize } : null,
            },
            docker: {
                version: info.ServerVersion,
                containers: info.Containers,
                running: info.ContainersRunning,
                images: info.Images,
            },
            platform: {
                deploys: subdomains.size,
                containers: appContainers.length,
                running: appContainers.filter(c => c.State === 'running').length,
                restarting: appContainers.filter(c => c.State === 'restarting').map(c => c.Names[0].slice(1)),
                users: users.size,
                databases: containers.filter(c => c.Names.some(n => n.startsWith('/db-'))).length,
                paused: deploysPaused,
            },
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Monitoreo: consumo por contenedor (más pesado, se consulta cada 30 s) ──
app.get('/admin/resources', ...adminOnly, async (req, res) => {
    try {
        const running = await docker.listContainers();
        const managed = running.filter(c => MANAGED_CONTAINER.test(c.Names[0].slice(1)));
        const results = await Promise.all(managed.map(async (c) => {
            const name = c.Names[0].slice(1);
            try {
                const s = await withTimeout(docker.getContainer(c.Id).stats({ stream: false }), 4000);
                const cache = s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0;
                const memory = Math.max(0, (s.memory_stats?.usage || 0) - cache);
                const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0) - (s.precpu_stats?.cpu_usage?.total_usage || 0);
                const sysDelta = (s.cpu_stats?.system_cpu_usage || 0) - (s.precpu_stats?.system_cpu_usage || 0);
                const cpus = s.cpu_stats?.online_cpus || 1;
                const cpuPercent = sysDelta > 0 ? Math.round((cpuDelta / sysDelta) * cpus * 1000) / 10 : 0;
                return { name, memory, cpuPercent };
            } catch {
                return { name, memory: null, cpuPercent: null };
            }
        }));
        results.sort((a, b) => (b.memory || 0) - (a.memory || 0));
        res.json({ containers: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Deploys de toda la plataforma ──
app.get('/admin/deploys', ...adminOnly, async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const grouped = {};

        for (const c of containers) {
            const name = c.Names[0].slice(1);
            if (!name.startsWith('container-')) continue;
            const L = c.Labels;
            const sub = L['deploy.subdomain'] || name.replace(/^container-/, '').replace(/-(backend|frontend)$/, '');
            const g = grouped[sub] ||= {
                subdomain: sub,
                repo: L['deploy.repo'] || 'unknown',
                branch: L['deploy.branch'] || 'unknown',
                userId: L['deploy.userId'] || 'unknown',
                userEmail: L['deploy.userEmail'] || 'unknown',
                deployedAt: L['deploy.timestamp'] || null,
                database: null,
                containers: [],
            };
            g.containers.push({ name, role: L['deploy.role'] || 'app', state: c.State, status: c.Status });
            if (!g.database && L['deploy.db.type']) g.database = { type: L['deploy.db.type'], name: L['deploy.db.name'] };
            if (L['deploy.timestamp'] && (!g.deployedAt || L['deploy.timestamp'] > g.deployedAt)) g.deployedAt = L['deploy.timestamp'];
        }

        // Bases de datos y Adminer: se agregan a su deploy, o se reportan como huérfanas
        const orphans = [];
        for (const c of containers) {
            const name = c.Names[0].slice(1);
            const m = name.match(/^(db|adminer)-(.+)$/);
            if (!m) continue;
            const entry = { name, role: m[1], state: c.State, status: c.Status };
            if (grouped[m[2]]) grouped[m[2]].containers.push(entry);
            else orphans.push({ ...entry, subdomain: m[2] });
        }

        const deploys = Object.values(grouped).map(g => ({
            ...g,
            health: g.containers.some(x => x.state === 'restarting') ? 'restarting'
                : g.containers.every(x => x.state === 'running') ? 'running' : 'degraded',
        }));
        deploys.sort((a, b) => String(b.deployedAt).localeCompare(String(a.deployedAt)));

        res.json({ deploys, orphans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Logs de un contenedor: de usuario (por nombre) o del sistema (por clave) ──
app.get('/admin/containers/:name/logs', ...adminOnly, async (req, res) => {
    const { name } = req.params;
    const tail = Math.min(parseInt(req.query.tail, 10) || 200, 1000);
    try {
        let target = name;
        if (!MANAGED_CONTAINER.test(name)) {
            if (!SYSTEM_SERVICES[name]) return res.status(400).json({ error: 'Contenedor no permitido' });
            const found = findSystemContainer(await docker.listContainers({ all: true }), name);
            if (!found) return res.status(404).json({ error: `No se encontró el contenedor de ${name}` });
            target = found.Id;
        }
        const buf = await docker.getContainer(target).logs({ stdout: true, stderr: true, tail, timestamps: true });
        res.json({ name, logs: demuxDockerLogs(buf) });
    } catch (e) {
        res.status(404).json({ error: e.message });
    }
});

// ── Acciones sobre contenedores de usuarios ──
app.post('/admin/containers/:name/:action', ...adminOnly, async (req, res) => {
    const { name, action } = req.params;
    if (!MANAGED_CONTAINER.test(name)) return res.status(400).json({ error: 'Contenedor no permitido' });
    if (!['restart', 'stop', 'start'].includes(action)) return res.status(400).json({ error: 'Acción no válida' });
    try {
        await docker.getContainer(name)[action]();
        audit(req, `container_${action}`, name);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Eliminar un deploy completo (de cualquier usuario) ──
app.delete('/admin/deploys/:subdomain', ...adminOnly, async (req, res) => {
    const { subdomain } = req.params;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(subdomain)) return res.status(400).json({ error: 'Subdominio inválido' });
    try {
        const removed = await removeDeployContainers(subdomain);
        audit(req, 'deploy_delete', subdomain);
        res.json({ ok: true, removed });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Actividad ──
app.get('/admin/activity', ...adminOnly, (req, res) => {
    res.json({ deployEvents, audit: adminAudit });
});

// ── Salud de servicios ──
app.get('/admin/health', ...adminOnly, async (req, res) => {
    const containers = await docker.listContainers({ all: true }).catch(() => []);
    const state = (key) => {
        const c = findSystemContainer(containers, key);
        return !c ? 'missing' : c.State === 'running' ? 'ok' : 'down';
    };
    const [dockerOk, webhook] = await Promise.all([
        docker.ping().then(() => 'ok').catch(() => 'down'),
        // adnanh/webhook responde 404 a un hook inexistente: cualquier respuesta = vivo
        checkHttp('http://host.docker.internal:9000/hooks/health-check', () => true),
    ]);
    res.json({
        paused: deploysPaused,
        checks: [
            { name: 'Docker (docker.sock)', status: dockerOk },
            { name: 'Traefik', status: state('traefik') },
            { name: 'Webhook autodeploy (:9000)', status: webhook },
            { name: 'Static server', status: state('static_server') },
            { name: 'Cloudflare Tunnel', status: state('cloudflared') },
            { name: 'Frontend StarDest', status: state('frontend') },
        ],
    });
});

// ── Mantenimiento ──
app.post('/admin/maintenance', ...adminOnly, (req, res) => {
    deploysPaused = !!req.body?.paused;
    audit(req, deploysPaused ? 'deploys_paused' : 'deploys_resumed');
    res.json({ paused: deploysPaused });
});

app.post('/admin/prune', ...adminOnly, async (req, res) => {
    try {
        const r = await docker.pruneImages({ filters: { dangling: ['true'] } });
        audit(req, 'prune_images');
        res.json({ reclaimed: r.SpaceReclaimed || 0, deleted: (r.ImagesDeleted || []).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// --- BOARD (pizarra de arquitectura) ---
// ==========================================
const BOARDS_DIR = path.join(DEPLOYS_DIR, 'boards');
const BOARD_KINDS = ['client', 'frontend', 'backend', 'app', 'database', 'cache', 'worker', 'external', 'note'];
const MAX_BOARDS_PER_USER = 20;
const MAX_BOARD_NODES = 300;
const MAX_BOARD_EDGES = 600;

// Un archivo por usuario, elegido con el JWT (nunca con datos del cliente).
// Incluye el provider para que IDs de Google y GitHub nunca choquen.
function boardsFile(user) {
    const safe = `${user.provider || 'user'}-${String(user.id)}`.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(BOARDS_DIR, `${safe}.json`);
}

function readUserBoards(user) {
    try {
        const boards = JSON.parse(fs.readFileSync(boardsFile(user), 'utf8'));
        return Array.isArray(boards) ? boards : [];
    } catch {
        return [];
    }
}

function writeUserBoards(user, boards) {
    fs.mkdirSync(BOARDS_DIR, { recursive: true });
    const file = boardsFile(user);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(boards));
    fs.renameSync(tmp, file); // escritura atómica: nunca queda un archivo a medias
}

const clampStr = (v, max) => String(v ?? '').slice(0, max);
const boardNum = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);

// Nunca se guarda lo que manda el cliente tal cual: se normaliza y se limita
function sanitizeBoardContent({ nodes = [], edges = [], viewport = {} } = {}) {
    const cleanNodes = (Array.isArray(nodes) ? nodes : []).slice(0, MAX_BOARD_NODES).map(n => ({
        id: clampStr(n?.id, 64),
        type: 'stardest',
        position: { x: boardNum(n?.position?.x), y: boardNum(n?.position?.y) },
        data: {
            kind: BOARD_KINDS.includes(n?.data?.kind) ? n.data.kind : 'app',
            label: clampStr(n?.data?.label, 80),
            notes: clampStr(n?.data?.notes, 1000),
            deploy: /^[a-z0-9-]{0,40}$/.test(n?.data?.deploy || '') ? (n?.data?.deploy || '') : '',
        },
    })).filter(n => n.id);

    const ids = new Set(cleanNodes.map(n => n.id));
    const cleanEdges = (Array.isArray(edges) ? edges : []).slice(0, MAX_BOARD_EDGES).map(e => ({
        id: clampStr(e?.id, 140),
        source: clampStr(e?.source, 64),
        target: clampStr(e?.target, 64),
        sourceHandle: e?.sourceHandle ? clampStr(e.sourceHandle, 16) : null,
        targetHandle: e?.targetHandle ? clampStr(e.targetHandle, 16) : null,
        label: clampStr(e?.label, 60),
    })).filter(e => e.id && ids.has(e.source) && ids.has(e.target));

    return {
        nodes: cleanNodes,
        edges: cleanEdges,
        viewport: {
            x: boardNum(viewport?.x),
            y: boardNum(viewport?.y),
            zoom: Math.min(4, Math.max(0.1, boardNum(viewport?.zoom) || 1)),
        },
    };
}

// Listar pizarras del usuario
app.get('/boards', requireAuth, (req, res) => {
    const boards = readUserBoards(req.user)
        .map(({ id, name, updatedAt, nodes }) => ({ id, name, updatedAt, nodeCount: (nodes || []).length }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ boards });
});

// Crear pizarra (vacía o con contenido inicial)
app.post('/boards', requireAuth, (req, res) => {
    try {
        const boards = readUserBoards(req.user);
        if (boards.length >= MAX_BOARDS_PER_USER) {
            return res.status(400).json({ error: `Máximo ${MAX_BOARDS_PER_USER} pizarras por usuario` });
        }
        const now = new Date().toISOString();
        const board = {
            id: crypto.randomUUID(),
            name: clampStr(req.body?.name || 'Nueva pizarra', 60),
            createdAt: now,
            updatedAt: now,
            ...sanitizeBoardContent(req.body),
        };
        boards.push(board);
        writeUserBoards(req.user, boards);
        res.status(201).json({ board });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obtener una pizarra
app.get('/boards/:id', requireAuth, (req, res) => {
    const board = readUserBoards(req.user).find(b => b.id === req.params.id);
    if (!board) return res.status(404).json({ error: 'Pizarra no encontrada' });
    res.json({ board });
});

// Guardar (autoguardado desde el editor). Si el body no trae nodes/edges
// (p. ej. solo renombrar), el contenido existente no se pisa con una pizarra vacía.
app.put('/boards/:id', requireAuth, (req, res) => {
    try {
        const boards = readUserBoards(req.user);
        const i = boards.findIndex(b => b.id === req.params.id);
        if (i === -1) return res.status(404).json({ error: 'Pizarra no encontrada' });
        const hasContent = Array.isArray(req.body?.nodes) && Array.isArray(req.body?.edges);
        boards[i] = {
            ...boards[i],
            ...(hasContent ? sanitizeBoardContent(req.body) : {}),
            name: req.body?.name ? clampStr(req.body.name, 60) : boards[i].name,
            updatedAt: new Date().toISOString(),
        };
        writeUserBoards(req.user, boards);
        res.json({ updatedAt: boards[i].updatedAt });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar
app.delete('/boards/:id', requireAuth, (req, res) => {
    try {
        const boards = readUserBoards(req.user);
        const next = boards.filter(b => b.id !== req.params.id);
        if (next.length === boards.length) return res.status(404).json({ error: 'Pizarra no encontrada' });
        writeUserBoards(req.user, next);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(4000, () => console.log("StarDest en puerto 4000"));