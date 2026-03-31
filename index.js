const Docker = require('dockerode');
const git = require('simple-git')();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Middlewares para leer el formulario
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir el HTML del dashboard si lo tienes en una carpeta 'public'
app.use(express.static('public'));

app.post('/deploy', async (req, res) => {
    const { repoUrl, subdomain } = req.body;
    
    // Validación básica para evitar que explote si vienen vacíos
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
        await git.clone(repoUrl, repoPath);

        // 2. BUILD
        console.log(`Construyendo imagen: ${imageName}...`);
        const stream = await docker.buildImage({
            context: repoPath,
            src: ['.'] // Usamos '.' para que mande todo lo que haya en la carpeta clonada
        }, { t: imageName });

        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
        });

        // 3. LIMPIEZA: Borrar contenedor viejo si existe
        console.log(`Limpiando versiones anteriores de ${subdomain}...`);
        const containers = await docker.listContainers({ all: true });
        const existing = containers.find(c => c.Names.includes(`/container-${subdomain}`));
        if (existing) {
            const oldContainer = docker.getContainer(existing.Id);
            await oldContainer.remove({ force: true });
        }

        // 4. DEPLOY: Lanzar con etiquetas para Traefik
        console.log(`Lanzando contenedor para ${subdomain}.stardest.com...`);
        
        const container = await docker.createContainer({
            Image: imageName,
            name: `container-${subdomain}`,
            Labels: {
                "traefik.enable": "true",
                // Usamos comillas invertidas ` para el Host de Traefik
                [`traefik.http.routers.${subdomain}.rule`]: `Host(\`${subdomain}.stardest.com\`)`,
                [`traefik.http.routers.${subdomain}.entrypoints`]: "web",
                // Ajusta el puerto 3000 si tus apps usan otro (ej: 80 u 8080)
                [`traefik.http.services.${subdomain}.loadbalancer.server.port`]: "3000"
            },
            HostConfig: {
                // VITAL: Conectar a la red donde vive Traefik
                NetworkMode: "deploys_internal_network", 
                RestartPolicy: { Name: "always" }
            }
        });

        await container.start();
        
        console.log(`✅ ¡Despliegue exitoso! Disponible en: http://${subdomain}.stardest.com`);
        res.send(`<h1>🚀 Desplegado con éxito</h1><p>Tu app ya debería estar visible en <a href="http://${subdomain}.stardest.com">http://${subdomain}.stardest.com</a></p><a href="/">Volver</a>`);

    } catch (error) {
        console.error("❌ Error en el despliegue:", error);
        res.status(500).send(`Error en el despliegue: ${error.message}`);
    }
});

app.listen(4000, () => console.log("Panel Vercel escuchando en puerto 4000"));
