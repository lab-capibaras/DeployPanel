# Instrucciones: Auto-inyectar `COPY . .` en Dockerfiles incompletos

## Contexto

Algunos repos tienen un `Dockerfile` que depende de **bind mounts** del `docker-compose.yml` original para llevar el código fuente al contenedor (`volumes: ./backend/public:/var/www/html/public`). Esto funciona en desarrollo local con `docker-compose up`, pero **no funciona** cuando StarDest construye la imagen de forma aislada — el `Dockerfile` nunca tiene un `COPY . .` y el contenedor queda sin código fuente, resultando en 404 de Apache/Nginx.

La solución es que StarDest detecte esta situación y **inyecte automáticamente** una instrucción `COPY . .` en el Dockerfile antes de buildear, sin necesidad de que el usuario edite su repo.

Esto aplica tanto al flujo de monorepo (`docker-compose-monorepo.md`) como al flujo estándar de `hasDockerfile` en la raíz.

---

## TAREA — Agregar función `ensureDockerfileCopiesSource`

En `deploy_panel/apps/builder/index.js`, agregar esta función antes de `deployApp`:

```javascript
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
```

---

## TAREA — Integrar en el flujo de build

En `deployApp`, dentro del bloque `if (hasDockerfile || monorepoApp)` (de `monorepo-compose.md`), llamar a la función **antes** de `docker.buildImage`:

```javascript
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
    // ... resto sin cambios
```

---

## Cómo funciona la detección

```
Leer Dockerfile
    ↓
¿Tiene una línea "COPY . <destino>"?
    ↓                           ↓
   SÍ                           NO
    ↓                           ↓
No modificar              Buscar primera línea EXPOSE/CMD/ENTRYPOINT
    ↓                           ↓
Build normal               Insertar "COPY . ." justo antes
                                ↓
                            Build con el código fuente incluido
```

### Ejemplo con el Dockerfile del repo MoneyFlu

**Antes (Dockerfile original del repo):**
```dockerfile
FROM php:8.2-apache
RUN a2enmod rewrite headers
RUN docker-php-ext-install pdo pdo_mysql
COPY apache-config.conf /etc/apache2/sites-available/000-default.conf
RUN { ... } > /usr/local/etc/php/conf.d/custom.ini
WORKDIR /var/www/html
EXPOSE 80
```

**Después (parcheado en memoria, solo en el clone temporal):**
```dockerfile
FROM php:8.2-apache
RUN a2enmod rewrite headers
RUN docker-php-ext-install pdo pdo_mysql
COPY apache-config.conf /etc/apache2/sites-available/000-default.conf
RUN { ... } > /usr/local/etc/php/conf.d/custom.ini
WORKDIR /var/www/html

# Auto-inyectado por StarDest: este Dockerfile dependía de volumes que
# solo existen en desarrollo local. Se copia el código fuente para producción.
COPY . .

EXPOSE 80
```

Esto copia todo el contenido del `build context` (en este caso `backend/`, que incluye `public/`, `src/`, etc.) a `/var/www/html` (el `WORKDIR` activo), exactamente donde Apache espera encontrarlo.

---

## Notas importantes

- **Solo se modifica el clone temporal** (`/app/temp/<subdomain>/...`), nunca el repo original en GitHub — el cambio desaparece cuando se borra el directorio temporal al final del deploy
- Si el `COPY . .` ya existe en el Dockerfile (la mayoría de repos bien configurados lo tienen), la función no hace nada
- El `COPY . .` se inserta usando el `WORKDIR` ya definido en el Dockerfile como destino implícito — si no hay `WORKDIR`, Docker usa `/` por defecto (comportamiento estándar de Docker, no algo que StarDest controle)
- Si el Dockerfile no tiene ninguna línea `EXPOSE`, `CMD` ni `ENTRYPOINT`, el `COPY . .` se agrega al final del archivo

---

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar función `ensureDockerfileCopiesSource` |
| `deploy_panel/apps/builder/index.js` | Llamar a la función antes de `docker.buildImage` en el bloque `hasDockerfile \|\| monorepoApp` |
