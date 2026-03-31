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

        const packageJsonPath = path.join(repoPath, 'package.json');
        let isNextJs = !!existingNextConfig;

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

            // FIX DEFINITIVO para Next.js 12 + @nextui-org/react:
            //
            // El problema:
            //   - Next.js 12 hace alias: "@swc/helpers" -> next/node_modules/@swc/helpers@0.4
            //   - @swc/helpers@0.4 solo tiene /lib/, NO tiene /_/
            //   - @nextui-org/react y @react-aria importan @swc/helpers/_/_class_private_field_*
            //   - webpack no los encuentra porque el alias apunta a 0.4
            //
            // La solución:
            //   - NO tocar el alias general de @swc/helpers (Next necesita 0.4/lib/)
            //   - Crear aliases PRECISOS solo para los 3 subpaths /_/ que necesitan
            //     @nextui-org y @react-aria, apuntando directamente a los archivos ESM de 0.5

            // Extraer config original si existe
            let originalConfigStr = '{}';
            if (existingNextConfig) {
                const existingPath = path.join(repoPath, existingNextConfig);
                const content = fs.readFileSync(existingPath, 'utf8');
                const match = content.match(/(?:module\.exports\s*=\s*|export\s+default\s+)(\{[\s\S]*?\});?\s*$/);
                if (match) originalConfigStr = match[1];
                if (existingNextConfig !== 'next.config.js') fs.unlinkSync(existingPath);
                console.log(`next.config existente (${existingNextConfig}) encontrado, aplicando fix...`);
            }

            // Verificar si tiene standalone
            let hasStandaloneOutput = originalConfigStr.includes('standalone');

            const newNextConfig = `const path = require('path');

const originalConfig = ${originalConfigStr};

/** @type {import('next').NextConfig} */
module.exports = {
  ...originalConfig,
  webpack: (config, options) => {
    // FIX: aliases precisos para los subpaths /_/ de @swc/helpers que
    // NO existen en la version 0.4.x interna de Next.js 12.
    // Apuntamos directamente a los archivos ESM de la version 0.5.x en raiz.
    // El alias general "@swc/helpers" NO se toca para no romper Next internamente.
    const swc05 = path.dirname(require.resolve('@swc/helpers/package.json'));

    config.resolve.alias['@swc/helpers/_/_class_private_field_init'] =
      path.join(swc05, 'esm', '_class_private_field_init.js');
    config.resolve.alias['@swc/helpers/_/_class_private_field_get'] =
      path.join(swc05, 'esm', '_class_private_field_get.js');
    config.resolve.alias['@swc/helpers/_/_class_private_field_set'] =
      path.join(swc05, 'esm', '_class_private_field_set.js');

    if (typeof originalConfig.webpack === 'function') {
      return originalConfig.webpack(config, options);
    }
    return config;
  },
};
`;
            fs.writeFileSync(path.join(repoPath, 'next.config.js'), newNextConfig);
            console.log('next.config.js generado con aliases precisos para @swc/helpers/_/');

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