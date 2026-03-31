const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os'); // ¡Añadido para obtener el ID del contenedor!
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
        
        // Configuramos git para que clone con profundidad 1 (más rápido)
        await git.clone(repoUrl, repoPath, ['--depth', '1']);

        // 2. ESTRATEGIA DE BUILD (Dockerfile vs Buildpacks)
        const hasDockerfile = fs.existsSync(path.join(repoPath, 'Dockerfile'));

        if (hasDockerfile) {
            console.log(`🐳 Dockerfile detectado. Usando build tradicional...`);
            const stream = await docker.buildImage({
                context: repoPath,
                src: ['.']
            }, { t: imageName });

            await new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            });
        } else {
            console.log(`✨ No hay Dockerfile. Usando Buildpacks para detectar el lenguaje...`);
            
            // LA MAGIA DE DOCKER-IN-DOCKER COMIENZA AQUÍ
            const absoluteRepoPath = path.resolve(repoPath);
            const containerId = os.hostname(); // Obtenemos el ID de este panel

            // Le decimos a Docker que lance el 'pack' más moderno y comparta nuestra carpeta temp
            const packCommand = `docker run --rm \
                -v /var/run/docker.sock:/var/run/docker.sock \
                --volumes-from ${containerId} \
                -w "${absoluteRepoPath}" \
                -e PORT=3000 \
                buildpacksio/pack:latest \
                build "${imageName}" --builder paketobuildpacks/builder-jammy-base`;

            await new Promise((resolve, reject) => {
                exec(packCommand, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error en Buildpacks: ${stderr || error.message}`);
                        return reject(new Error("Fallo en la autodetección del lenguaje (Buildpacks)"));
                    }
                    console.log(stdout);
                    resolve();
                });
            });
        }

        // 3. LIMPIEZA: Borrar contenedor viejo
        console.log(`Limpiando versiones anteriores...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            await docker.getContainer(existing.Id).remove({ force: true });
        }

        // 4. DEPLOY: Lanzar con etiquetas para Traefik
        console.log(`Lanzando contenedor en la red de Traefik...`);
        
        const container = await docker.createContainer({
            Image: imageName,
            name: `container-${subdomain}`,
            Labels: {
                "traefik.enable": "true",
                [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
                [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
                // NOTA: Buildpacks suele exponer las apps en el puerto 8080 por defecto
                [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: hasDockerfile ? "3000" : "8080"
            },
            HostConfig: {
                NetworkMode: "deploys_internal_network", 
                RestartPolicy: { Name: "always" }
            }
        });

        await container.start();
        
        res.send(`<h1>🚀 Desplegado con Buildpacks</h1><p>Tu app está en <a href="http://${subdomain}.stardest.com">http://${subdomain}.stardest.com</a></p><a href="/">Volver</a>`);

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

app.listen(4000, () => console.log("Panel PRO con Buildpacks en puerto 4000"));