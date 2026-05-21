const express  = require('express');
const multer   = require('multer');
const AdmZip   = require('adm-zip');
const fs       = require('fs');
const path     = require('path');
const Docker   = require('dockerode');

const router = express.Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const STATIC_BASE   = '/home/project/deploys/static_sites';
const NGINX_CONFIGS = '/home/project/deploys/nginx_configs';
const STATIC_PROJECTS_FILE = '/home/project/deploys/static_projects.json';

const upload = multer({
  dest: '/tmp/static_uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .zip'));
    }
  }
});

function readStaticProjects() {
  if (!fs.existsSync(STATIC_PROJECTS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(STATIC_PROJECTS_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeStaticProjects(data) {
  fs.writeFileSync(STATIC_PROJECTS_FILE, JSON.stringify(data, null, 2));
}

async function reloadNginx() {
  try {
    const container = docker.getContainer('static_server');
    const exec = await container.exec({
      Cmd: ['nginx', '-s', 'reload'],
      AttachStdout: true,
      AttachStderr: true,
    });
    await exec.start();
  } catch (err) {
    console.warn('[upload-static] No se pudo recargar nginx (¿está corriendo static_server?):', err.message);
  }
}

// POST /upload-static
// multipart/form-data: { site: string, zip: File }
// Accesible externamente en POST /api/upload-static
router.post('/upload-static', upload.single('zip'), async (req, res) => {
  const tmpFile = req.file?.path;
  try {
    const { site } = req.body;

    if (!site || !/^[a-z0-9-]+$/.test(site)) {
      return res.status(400).json({
        ok: false,
        error: 'Nombre de sitio inválido. Solo letras minúsculas, números y guiones.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo .zip' });
    }

    const siteDir  = path.join(STATIC_BASE, site);
    const confPath = path.join(NGINX_CONFIGS, `${site}.conf`);

    // Extraer zip
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    fs.mkdirSync(siteDir, { recursive: true });
    
    const zip = new AdmZip(tmpFile);
    zip.extractAllTo(siteDir, true);

    // Si el zip tenía una sola carpeta raíz (ej: dist/), subir su contenido un nivel
    const entries = await fs.promises.readdir(siteDir);
    if (entries.length === 1) {
      const singleEntry = path.join(siteDir, entries[0]);
      const stat = await fs.promises.stat(singleEntry);
      if (stat.isDirectory()) {
        const innerFiles = await fs.promises.readdir(singleEntry);
        for (const f of innerFiles) {
          await fs.promises.rename(path.join(singleEntry, f), path.join(siteDir, f));
        }
        await fs.promises.rm(singleEntry, { recursive: true, force: true });
      }
    }

    // Validar que exista index.html
    const hasIndex = fs.existsSync(path.join(siteDir, 'index.html'));
    if (!hasIndex) {
      if (fs.existsSync(siteDir)) {
        fs.rmSync(siteDir, { recursive: true, force: true });
      }
      return res.status(400).json({
        ok: false,
        error: 'El zip no contiene un index.html en la raíz.'
      });
    }

    // Crear config nginx si no existe
    if (!fs.existsSync(confPath)) {
      const nginxConf = `server {
    listen 80;
    server_name ${site}.stardest.com;
    root /srv/static/${site};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}`;
      await fs.promises.writeFile(confPath, nginxConf);
    }

    // Asegurar default.conf fallback
    const defaultConf = path.join(NGINX_CONFIGS, 'default.conf');
    if (!fs.existsSync(defaultConf)) {
      fs.writeFileSync(defaultConf, `server {\n    listen 80 default_server;\n    server_name _;\n    return 404;\n}\n`);
    }

    // Registrar en static_projects.json
    const projects = readStaticProjects();
    projects[site] = { repo: 'zip-upload', branch: 'upload', build_cmd: '', output_dir: '' };
    writeStaticProjects(projects);

    await reloadNginx();
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile, { force: true });
    }

    res.json({ ok: true, url: `https://${site}.stardest.com` });

  } catch (err) {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile, { force: true });
    }
    console.error('[upload-static]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /static-sites/:site
// Accesible externamente en DELETE /api/static-sites/:site
router.delete('/static-sites/:site', async (req, res) => {
  try {
    const { site } = req.params;
    if (!/^[a-z0-9-]+$/.test(site)) {
      return res.status(400).json({ ok: false, error: 'Nombre de sitio inválido.' });
    }
    const siteDir = path.join(STATIC_BASE, site);
    const confPath = path.join(NGINX_CONFIGS, `${site}.conf`);
    
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    if (fs.existsSync(confPath)) {
      fs.rmSync(confPath, { force: true });
    }

    const projects = readStaticProjects();
    if (projects[site]) {
      delete projects[site];
      writeStaticProjects(projects);
    }

    await reloadNginx();
    res.json({ ok: true });
  } catch (err) {
    console.error('[delete-static]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
