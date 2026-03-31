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

        const hasNextConfig =
            fs.existsSync(path.join(repoPath, 'next.config.js')) ||
            fs.existsSync(path.join(repoPath, 'next.config.ts')) ||
            fs.existsSync(path.join(repoPath, 'next.config.mjs'));

        const packageJsonPath = path.join(repoPath, 'package.json');
        let isNextJs = hasNextConfig;

        if (!isNextJs && fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                isNextJs = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
            } catch (e) {
                console.warn('No se pudo leer package.json para detectar Next.js:', e.message);
            }
        }

        // 3. ESTRATEGIA DE BUILD
        if (hasDockerfile) {
            // --- ESTRATEGIA A: Dockerfile existente ---
            console.log(`Dockerfile detectado. Usando build tradicional...`);

            const stream = await docker.buildImage({
                context: repoPath,
                src: ['.']
            }, { t: imageName });

            await new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            });

        } else if (isNextJs) {
            // --- ESTRATEGIA B: Proyecto Next.js sin Dockerfile ---
            console.log(`Proyecto Next.js detectado. Generando Dockerfile optimizado...`);

            // Verificar si el proyecto tiene "output: standalone" en next.config
            // Si no, usamos npm start directamente para evitar el problema de server.js faltante
            let hasStandaloneOutput = false;
            const nextConfigFiles = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
            for (const configFile of nextConfigFiles) {
                const configPath = path.join(repoPath, configFile);
                if (fs.existsSync(configPath)) {
                    const content = fs.readFileSync(configPath, 'utf8');
                    if (content.includes('standalone')) {
                        hasStandaloneOutput = true;
                    }
                    break;
                }
            }

            let dockerfile;

            if (hasStandaloneOutput) {
                // Usa output standalone (más eficiente)
                dockerfile = `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
`;
            } else {
                // Sin standalone: build y npm start
                dockerfile = `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
`;
            }

            fs.writeFileSync(path.join(repoPath, 'Dockerfile'), dockerfile);
            console.log(`Dockerfile generado (modo: ${hasStandaloneOutput ? 'standalone' : 'npm start'})`);

            const stream = await docker.buildImage({
                context: repoPath,
                src: ['.']
            }, { t: imageName });

            await new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err, outputRes) => {
                    if (err) return reject(err);
                    // Mostrar últimas líneas del build en caso de error
                    const lastLines = outputRes.slice(-10).map(l => l.stream || l.error || '').join('');
                    console.log('Build finalizado:\n', lastLines);
                    resolve(outputRes);
                });
            });

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
        console.error("Error durante el despliegue:", error);
        res.status(500).json({
            status: 'error',
            details: error.message
        });
    }
});

app.listen(4000, () => console.log("Panel PRO con Buildpacks en puerto 4000"));