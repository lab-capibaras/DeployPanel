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

app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain } = req.body;

    if (!repoUrl || !subdomain) {
        return res.status(400).send("Faltan datos: repoUrl o subdomain");
    }

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const repoPath = path.join(tempDir, subdomain);
    const imageName = `user-app-${subdomain.toLowerCase()}`;

    try {
        // 1. CLONAR
        console.log(`Clonando ${repoUrl}...`);
        if (fs.existsSync(repoPath)) fs.rmSync(repoPath, { recursive: true, force: true });
        await git.clone(repoUrl, repoPath, ['--depth', '1']);

        // 2. DETECTAR TIPO DE PROYECTO
        const hasDockerfile = fs.existsSync(path.join(repoPath, 'Dockerfile'));

        const nextConfigFiles = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
        const existingNextConfig = nextConfigFiles.find(f => fs.existsSync(path.join(repoPath, f)));
        const hasNextConfig = !!existingNextConfig;

        const packageJsonPath = path.join(repoPath, 'package.json');
        let isNextJs = hasNextConfig;

        if (!isNextJs && fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                isNextJs = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
            } catch (e) {
                console.warn('No se pudo leer package.json:', e.message);
            }
        }

        // Helper: detectar versión mayor de Next.js
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

        // Helper: ejecutar docker build y lanzar error si falla
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
            // --- ESTRATEGIA A: Dockerfile existente ---
            console.log(`Dockerfile detectado. Usando build tradicional...`);
            const stream = await docker.buildImage({ context: repoPath, src: ['.'] }, { t: imageName });
            await runDockerBuild(stream);

        } else if (isNextJs) {
            // --- ESTRATEGIA B: Proyecto Next.js sin Dockerfile ---
            console.log(`Proyecto Next.js detectado. Generando Dockerfile optimizado...`);

            const nextMajor = getNextVersion(packageJsonPath);
            console.log(`Versión de Next.js detectada: ${nextMajor}.x`);

            // Inyectar webpack alias en next.config.js para redirigir @swc/helpers/_/ 
            // a la versión 0.5 instalada en la raíz, sin romper la versión que usa Next internamente
            const nextConfigPath = path.join(repoPath, existingNextConfig || 'next.config.js');
            let nextConfigContent = '';

            if (existingNextConfig) {
                nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
                console.log(`next.config.js existente encontrado, inyectando webpack alias...`);
            }

            // Si ya tiene webpack config, la envolvemos; si no, creamos una nueva
            const hasWebpackConfig = nextConfigContent.includes('webpack');

            if (!hasWebpackConfig) {
                // Crear o reemplazar con configuración que incluye webpack alias
                const newConfig = `
/** @type {import('next').NextConfig} */
const originalConfig = (() => {
  try {
    ${nextConfigContent ? `
    // Configuración original del proyecto
    ${nextConfigContent
        .replace(/module\.exports\s*=\s*/, 'return ')
        .replace(/export default\s*/, 'return ')
    }
    ` : 'return {};'}
  } catch(e) { return {}; }
})() || {};

module.exports = {
  ...originalConfig,
  webpack: (config, options) => {
    // Alias para redirigir @swc/helpers/_/ a la versión compatible (0.5.x)
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    
    const swcHelpersNew = require('path').resolve('./node_modules/@swc/helpers-new');
    
    // Redirigir las importaciones problemáticas de /_/ al nuevo @swc/helpers
    config.resolve.alias['@swc/helpers/_'] = swcHelpersNew + '/_';
    
    if (originalConfig.webpack) {
      return originalConfig.webpack(config, options);
    }
    return config;
  },
};
`;
                fs.writeFileSync(nextConfigPath, newConfig);
                console.log('next.config.js generado con webpack alias');
            }

            // Verificar si el proyecto tiene "output: standalone"
            let hasStandaloneOutput = false;
            if (existingNextConfig) {
                const content = fs.readFileSync(nextConfigPath, 'utf8');
                if (content.includes('standalone')) hasStandaloneOutput = true;
            }

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

            // El Dockerfile instala @swc/helpers@0.5 con un alias de nombre
            // para que Next.js siga usando su propio @swc/helpers@0.4 internamente
            const dockerfile = `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
# Instalar @swc/helpers 0.5 con nombre alternativo para no colisionar con el de Next.js
RUN cp -r /app/node_modules/@swc/helpers /app/node_modules/@swc/helpers-new-backup 2>/dev/null || true && \\
    npm install @swc/helpers@0.5 --legacy-peer-deps --no-save && \\
    cp -r /app/node_modules/@swc/helpers /app/node_modules/@swc/helpers-new && \\
    # Restaurar la versión original de @swc/helpers para Next.js
    rm -rf /app/node_modules/@swc/helpers && \\
    mv /app/node_modules/@swc/helpers-new-backup /app/node_modules/@swc/helpers 2>/dev/null || \\
    npm install @swc/helpers@0.4 --legacy-peer-deps --no-save

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

            const stream = await docker.buildImage({
                context: repoPath,
                src: ['.']
            }, { t: imageName });

            await runDockerBuild(stream);

        } else {
            // --- ESTRATEGIA C: Buildpacks para otros lenguajes/frameworks ---
            console.log(`No hay Dockerfile ni Next.js detectado. Usando Buildpacks...`);

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
                        console.log("---------------------------------------");
                        return reject(new Error(`Fallo en la autodetección del lenguaje (Buildpacks): ${stderr || error.message}`));
                    }
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
                [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000"
            },
            HostConfig: {
                NetworkMode: "deploys_internal_network",
                RestartPolicy: { Name: "always" },
                Privileged: true
            }
        });

        await container.start();

        res.json({
            status: 'success',
            url: `http://${subdomain}.stardest.com`,
            message: 'Aplicación desplegada exitosamente'
        });

    } catch (error) {
        console.error("Error durante el despliegue:", error.message);
        res.status(500).json({
            status: 'error',
            details: error.message
        });
    }
});

app.listen(4000, () => console.log("Panel PRO con Buildpacks en puerto 4000"));