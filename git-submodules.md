# Instrucciones: Clonar submódulos de Git automáticamente

## Contexto

Actualmente `deployApp` clona el repo con:

```javascript
const cloneOptions = ['--depth', '1'];
if (branch) {
    cloneOptions.push('--branch', branch);
}
await git.clone(repoUrl, repoPath, cloneOptions);
```

Esto **no descarga el contenido de los submódulos** — si el repo tiene una carpeta como `frontend` que es un submódulo de Git, queda vacía después del clone.

---

## TAREA — Agregar `--recurse-submodules` al clone

En `deploy_panel/apps/builder/index.js`, dentro de `deployApp`, modificar el array `cloneOptions`:

```javascript
const cloneOptions = ['--depth', '1', '--recurse-submodules'];
if (branch) {
    cloneOptions.push('--branch', branch);
    console.log(`Descargando la rama específica: ${branch}`);
} else {
    console.log(`Descargando la rama por defecto (main/master)`);
}

await git.clone(repoUrl, repoPath, cloneOptions);
```

Solo se agrega `'--recurse-submodules'` al array existente — el resto de la lógica no cambia.

---

## Notas

- Si el submódulo es un **repositorio privado**, el clone de submódulos puede fallar por falta de credenciales. En ese caso el error aparecerá en los logs del deploy como un fallo de autenticación de Git al intentar descargar el submódulo — esto está fuera del alcance de este cambio, ya que requeriría configurar credenciales adicionales en el servidor
- Si el repo no tiene submódulos, esta flag no tiene ningún efecto — es seguro agregarla siempre
- Aumenta levemente el tiempo de clone solo cuando sí hay submódulos

## Resumen

| Archivo | Cambio |
|---------|--------|
| `deploy_panel/apps/builder/index.js` | Agregar `'--recurse-submodules'` al array `cloneOptions` en `deployApp` |
