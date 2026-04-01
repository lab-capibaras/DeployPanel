# 🌿 Guía de Despliegue por Ramas

## 📋 Concepto: Rama + Subdominio Personalizados

El sistema permite desplegar **diferentes ramas** de un mismo repositorio en **subdominios personalizados**:

- La **rama** determina **qué versión del código** se despliega
- El **subdominio** lo eliges tú libremente, puede ser cualquier nombre

### Ejemplos Comunes

| Lo que quieres desplegar | Rama          | Subdominio sugerido | URL Resultante                  |
|--------------------------|---------------|---------------------|---------------------------------|
| Producción               | `main`        | `py`                | https://py.stardest.com         |
| Ambiente de QA           | `qa`          | `qa-py`             | https://qa-py.stardest.com      |
| Desarrollo               | `dev`         | `dev-py`            | https://dev-py.stardest.com     |
| Staging                  | `staging`     | `staging-py`        | https://staging-py.stardest.com |
| Feature Branch           | `feature/login` | `login-test`      | https://login-test.stardest.com |

**Importante**: El subdominio es **completamente libre**, solo es una sugerencia. Puedes usar `py`, `api`, `backend`, `test123`, lo que prefieras.

## 🚀 Nuevo Flujo de Despliegue

### Paso 1: Cargar Ramas del Repositorio
1. Ingresa la URL del repositorio de GitHub
2. Haz clic en el botón **"🔍 Cargar Ramas"**
3. El sistema obtendrá todas las ramas disponibles del repositorio

### Paso 2: Seleccionar Rama y Subdominio
1. Selecciona la **rama** que deseas desplegar desde el dropdown
2. **Escribe manualmente** el **subdominio** que prefieras (ej: `py`, `qa-py`, `mi-app`)

### Paso 3: Desplegar
1. Haz clic en **"Desplegar Aplicación"**
2. El sistema clonará la rama específica
3. Construirá la imagen Docker
4. Desplegará el contenedor con Traefik

## 🔗 Vinculación de Rama al Contenedor

Cada contenedor desplegado guarda **metadatos de la rama**:

- **Rama desplegada**: Almacenada en etiqueta `deploy.branch`
- **Repositorio**: Almacenado en etiqueta `deploy.repo`
- **Fecha de despliegue**: Almacenada en etiqueta `deploy.timestamp`

## 📊 Consultar Despliegues Activos

Puedes consultar todos los despliegues activos con su información de rama:

```bash
curl http://localhost:4000/deploys
```

**Respuesta de ejemplo:**
```json
{
  "status": "success",
  "deploys": [
    {
      "subdomain": "py",
      "status": "running",
      "branch": "main",
      "repo": "https://github.com/usuario/mi-proyecto",
      "deployedAt": "2026-03-31T10:30:00.000Z",
      "image": "user-app-py"
    },
    {
      "subdomain": "qa-py",
      "status": "running",
      "branch": "qa",
      "repo": "https://github.com/usuario/mi-proyecto",
      "deployedAt": "2026-03-31T11:15:00.000Z",
      "image": "user-app-qa-py"
    }
  ]
}
```

## 🎯 Casos de Uso

### Desplegar Producción desde Main
1. Carga las ramas
2. Selecciona `main`
3. Escribe `py` como subdominio
4. Resultado: `py.stardest.com` desplegará la rama main

### Desplegar Entorno de QA
1. Carga las ramas
2. Selecciona `qa`
3. Escribe `qa-py` como subdominio
4. Resultado: `qa-py.stardest.com` desplegará la rama qa

### Desplegar Feature Branch para Testing
1. Carga las ramas
2. Selecciona `feature/nueva-funcionalidad`
3. Escribe `test-login` como subdominio (o cualquier nombre)
4. Resultado: `test-login.stardest.com` desplegará la feature branch

### Múltiples Versiones del Mismo Proyecto
Puedes desplegar la **misma rama en diferentes subdominios**:
- `main` → `py` (producción)
- `main` → `py-backup` (respaldo)
- `qa` → `qa-py` (qa principal)
- `qa` → `qa-test` (qa para testing específico)

## ⚠️ Notas Importantes

1. **Repositorios Públicos**: El sistema usa la API pública de GitHub, asegúrate de que tu repositorio sea público o configura un token de acceso
2. **Sobrescritura**: Si despliegas dos veces en el mismo subdominio, el contenedor anterior será reemplazado
3. **Persistencia**: La información de la rama se mantiene en el contenedor hasta que sea eliminado

## 🛠️ Comandos Útiles

### Ver contenedores con sus ramas
```bash
docker ps --format "table {{.Names}}\t{{.Label \"deploy.branch\"}}\t{{.Label \"deploy.repo\"}}"
```

### Eliminar un despliegue
```bash
curl -X DELETE http://localhost:4000/deploy/qa-py
```

## 🔄 Actualización de una Rama

Para actualizar un despliegue existente:
1. Simplemente vuelve a desplegar la misma rama
2. El sistema eliminará el contenedor anterior
3. Clonará la versión más reciente de la rama
4. Creará un nuevo contenedor

## 🐛 Debugging

Si necesitas verificar qué rama está corriendo:
```bash
docker inspect container-py | grep "deploy.branch"
```

O consulta el endpoint `/deploys` para ver todos los despliegues activos.
