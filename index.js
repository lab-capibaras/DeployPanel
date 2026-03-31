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

        // 2. ESTRATEGIA DE BUILD
        const hasDockerfile = fs.existsSync(path.join(repoPath, 'Dockerfile'));

        if (hasDockerfile) {
            console.log(`Dockerfile detectado. Usando build tradicional...`);
            const stream = await docker.buildImage({
                context: repoPath,
                src: ['.']
            }, { t: imageName });

            await new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            });
        } else {
            console.log(`No hay Dockerfile. Usando Buildpacks para detectar el lenguaje...`);
            
            const absoluteRepoPath = path.resolve(repoPath);
            const containerId = os.hostname();

            // MODIFICACIÓN: Añadimos instalación de dependencias y límites de memoria
            // Cambiamos el comando para asegurar que existan los módulos antes del build de Next.js
            const packCommand = `docker run --rm \
                -v /var/run/docker.sock:/var/run/docker.sock \
                --volumes-from ${containerId} \
                -w "${absoluteRepoPath}" \
                -e DOCKER_API_VERSION=1.44 \
                -e PORT=3000 \
                -e NODE_OPTIONS="--max-old-space-size=2048" \
                buildpacksio/pack:latest \
                build "${imageName}" \
                --builder paketobuildpacks/builder-jammy-base \
                --env "BP_NODE_PROJECT_BUILD_COMMAND=npm install && npm run build"`;

            console.log("Iniciando construcción con Buildpacks (esto puede tardar)...");

            await new Promise((resolve, reject) => {
                const packProcess = exec(packCommand, (error, stdout, stderr) => {
                    if (error) {
                        // Si falla, mostramos TODO en el log del servidor
                        console.log("--- ERROR DETALLADO DE BUILDPACKS ---");
                        console.log(stdout);
                        console.log(stderr);
                        console.log("---------------------------------------");
                        return reject(new Error(`Fallo en Buildpacks: ${stderr || error.message}`));
                    }
                    resolve();
                });

                // ESTO TE MUESTRA EL PROGRESO EN VIVO EN TU TERMINAL
                packProcess.stdout.pipe(process.stdout);
                packProcess.stderr.pipe(process.stderr);
            });
        }

        // 3. LIMPIEZA
        console.log(`Limpiando versiones anteriores...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }

        // 4. DEPLOY
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
                RestartPolicy: { Name: "always" }
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

app.listen(4000, () => console.log("DeployPanel iniciado en puerto 4000"));