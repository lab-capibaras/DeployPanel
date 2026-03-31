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

        const nextConfigFileNames = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
        const existingNextConfig = nextConfigFileNames.find(f => fs.existsSync(path.join(repoPath, f)));
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

            // FIX DEFINITIVO:
            // Next.js 12 hace alias en webpack: "@swc/helpers" -> next/node_modules/@swc/helpers (v0.4.x)
            // que NO tiene la carpeta /_/ que necesitan @nextui-org/react y @react-aria.
            // Solución: sobreescribir ese alias en next.config.js para que apunte
            // al @swc/helpers@0.5 instalado en la raíz del proyecto.
            const nextConfigPath = path.join(repoPath, 'next.config.js');

            let originalConfig = '{}';
            if (existingNextConfig) {
                const existingPath = path.join(repoPath, existingNextConfig);
                const content = fs.readFileSync(existingPath, 'utf8');

                // Extraer solo el objeto de configuración
                const match = content.match(/(?:module\.exports\s*=\s*|export\s+default\s+)(\{[\s\S]*\})/);
                if (match) {
                    originalConfig = match[1];
                }

                // Eliminar el config original si no es next.config.js (ts/mjs)
                if (existingNextConfig !== 'next.config.js') {
                    fs.unlinkSync(existingPath);
                }

                console.log(`next.config existente encontrado (${existingNextConfig}), inyectando alias fix...`);
            }

            // Generar next.config.js con el alias fix
            // Usamos path.resolve en el Dockerfile para obtener la ruta correcta en runtime
            const newNextConfig = `
const path = require('path');

const originalConfig = ${originalConfig};

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...originalConfig,
  webpack: (config, options) => {
    // FIX: Redirigir @swc/helpers al 0.5.x de la raiz que tiene la API /_/
    // Next.js 12 internamente apunta @swc/helpers a su propio 0.4.x que NO tiene /_/
    config.resolve.alias['@swc/helpers'] = path.dirname(
      require.resolve('@swc/helpers/package.json')
    );

    // Llamar al webpack config original si existe
    if (typeof originalConfig.webpack === 'function') {
      return originalConfig.webpack(config, options);
    }
    return config;
  },
};

module.exports = nextConfig;
`;

            fs.writeFileSync(nextConfigPath, newNextConfig);
            console.log('next.config.js generado con alias fix para @swc/helpers');

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