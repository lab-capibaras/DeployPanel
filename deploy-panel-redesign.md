# Rediseño: Panel de Deploy — moderno y minimalista

## Contexto

El panel actual usa `borderRadius: 0` en prácticamente todos los elementos (panel principal, inputs, botones, tabs, drag-zone). El objetivo es reemplazar todos esos ceros por radios apropiados, modernizar el sistema de color de los botones y agregar micro-animaciones de interacción, **sin tocar ninguna lógica de negocio**.

---

## CAMBIO 1 — Constantes de diseño

En `Deploy.jsx`, reemplazar el bloque `// ===== DESIGN CONSTANTS =====` completo (líneas ~383–402):

```jsx
// ===== DESIGN CONSTANTS =====
const pageBg       = 'var(--px-bg)';
const pageTextColor = 'var(--px-white)';
const cardBg       = 'var(--px-surface)';
const cardBorder   = 'var(--px-border)';
const cardShadow   = isDark
  ? '0 24px 48px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset'
  : '0 24px 48px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.9) inset';

const textTitle  = 'var(--px-white)';
const textMuted  = 'var(--px-muted)';
const labelColor = 'var(--px-muted)';

// Input styles
const inputBg     = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
const inputColor  = 'var(--px-white)';
const inputBorder = 'var(--px-border)';
const inputShadow = 'none';
const inputRadius = 10;   // ← nuevo

// Button styles
const btnGradient = 'var(--px-accent)';
const btnShadow   = isDark
  ? '0 4px 16px rgba(0,0,0,0.4)'
  : '0 4px 16px rgba(0,0,0,0.12)';
const btnRadius   = 10;   // ← nuevo

// Card radius
const cardRadius  = 16;   // ← nuevo
```

---

## CAMBIO 2 — Panel contenedor principal

Buscar el div que envuelve todo el formulario (actualmente `borderRadius: 0`):

```jsx
// ANTES:
<div className="p-5 sm:p-8" style={{
  background: cardBg,
  border: `1px solid ${cardBorder}`,
  borderRadius: 0,
  boxShadow: cardShadow,
}}>

// DESPUÉS:
<div className="p-5 sm:p-8" style={{
  background: cardBg,
  border: `1px solid ${cardBorder}`,
  borderRadius: cardRadius,
  boxShadow: cardShadow,
}}>
```

---

## CAMBIO 3 — Tab switcher (Git / Subir Archivos)

Reemplazar el bloque del tab switcher para usar tabs tipo "pill" flotantes en lugar de línea inferior cuadrada:

```jsx
{/* ── Tab switcher ── */}
{(phase === 'form' || uploadPhase === 'form') && (
  <div style={{
    display: 'flex',
    gap: 4,
    marginBottom: 32,
    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 4,
  }}>
    {[
      { id: 'git',    label: u.tab_git,    icon: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' },
      { id: 'upload', label: u.tab_upload, icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    ].map(tab => {
      const isActive = mode === tab.id;
      return (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          onClick={() => { setMode(tab.id); if (tab.id === 'git') resetUpload(); else reset(); }}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 16px',
            borderRadius: 9,
            background: isActive
              ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
              : 'transparent',
            border: 'none',
            color: isActive ? 'var(--px-white)' : textMuted,
            fontFamily: "'Inter',sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(12px, 3.5vw, 13px)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.23,1,0.32,1)',
            boxShadow: isActive
              ? (isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)')
              : 'none',
          }}
        >
          <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill={tab.id === 'git' ? 'currentColor' : 'none'} stroke={tab.id === 'upload' ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d={tab.icon} />
          </svg>
          <span className="truncate">{tab.label}</span>
        </button>
      );
    })}
  </div>
)}
```

---

## CAMBIO 4 — Todos los inputs y select

Buscar **todas** las ocurrencias de `borderRadius: 0` dentro de elementos `input`, `select` y `textarea` y reemplazarlas por `borderRadius: inputRadius`.

Hay 4 inputs principales:
- URL del repositorio
- Selector de rama (select)
- Subdominio
- El input del modo upload

En el span de sufijo `.stardest.com` que va pegado al input de subdominio, también cambiar:
```jsx
// ANTES:
borderRadius: 0,

// DESPUÉS — en el input:
borderRadius: `${inputRadius}px 0 0 ${inputRadius}px`,

// DESPUÉS — en el span sufijo:
borderRadius: `0 ${inputRadius}px ${inputRadius}px 0`,
```

---

## CAMBIO 5 — Botón "Cargar Ramas"

```jsx
// ANTES:
borderRadius: 0,

// DESPUÉS:
borderRadius: `0 ${btnRadius}px ${btnRadius}px 0`,
```

(Va pegado al input, así que solo redondea la derecha.)

---

## CAMBIO 6 — Botón CTA principal "Revisar Despliegue"

```jsx
// ANTES:
style={{
  width: '100%',
  padding: '14px 24px',
  background: btnGradient,
  border: '1px solid var(--px-accent)',
  color: 'var(--px-accent-fg)',
  fontFamily: "'Inter',sans-serif",
  fontSize: 18,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  boxShadow: btnShadow,
  transition: 'all 0.15s ease',
  // borderRadius: 0  ← buscar y reemplazar
}}

// DESPUÉS — agregar al mismo objeto de estilos:
borderRadius: btnRadius,
transform: 'scale(1)',
// Y en onMouseEnter/onMouseLeave agregar el scale:
onMouseEnter={(e) => {
  e.currentTarget.style.opacity = '0.88';
  e.currentTarget.style.transform = 'scale(1.01)';
}}
onMouseLeave={(e) => {
  e.currentTarget.style.opacity = '1';
  e.currentTarget.style.transform = 'scale(1)';
}}
```

---

## CAMBIO 7 — Zona de drag & drop (modo Upload)

Buscar el div de drag & drop (el que tiene `onDrop`, `onDragOver`, actualmente con bordes punteados) y modernizarlo:

```jsx
// Buscar el div con el estilo de drag & drop y reemplazar su borderRadius:
// ANTES: borderRadius: 0  (o sin borderRadius)
// DESPUÉS:
borderRadius: 14,

// También suavizar el borde punteado:
// ANTES: border: '2px dashed ...'  con color fijo
// DESPUÉS — hacer que cambie suavemente con isDragOver:
border: `2px dashed ${isDragOver
  ? 'var(--px-accent)'
  : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
background: isDragOver
  ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
  : 'transparent',
transition: 'all 0.2s ease',
```

---

## CAMBIO 8 — Barra de progreso

Buscar la barra de progreso (el div con `width: progress + '%'`) y redondearla:

```jsx
// Contenedor:
borderRadius: 99,
overflow: 'hidden',

// Fill:
borderRadius: 99,
transition: 'width 0.4s cubic-bezier(0.23,1,0.32,1)',
```

---

## CAMBIO 9 — Panel de éxito / error

Buscar los divs de estado success y error (tienen íconos de check o X) y agregar `borderRadius: 12` al contenedor y `borderRadius: 999` a los iconos circulares.

---

## CAMBIO 10 — Labels más limpios

Los labels actuales usan `textTransform: 'uppercase'` y `letterSpacing: '0.08em'` lo que los hace pesados. Suavizar:

```jsx
// ANTES:
fontSize: 15,
letterSpacing: '0.08em',
textTransform: 'uppercase',

// DESPUÉS:
fontSize: 12,
letterSpacing: '0.06em',
textTransform: 'uppercase',
fontWeight: 600,
```

---

## CAMBIO 11 — Header de la página (título + badge)

El título actual es muy grande y en mayúsculas. Modernizar:

```jsx
// ANTES:
fontSize: 'clamp(32px, 6vw, 56px)',
textTransform: 'uppercase',
letterSpacing: '-0.02em',

// DESPUÉS:
fontSize: 'clamp(28px, 5vw, 44px)',
textTransform: 'none',         // quitar las mayúsculas forzadas
letterSpacing: '-0.03em',
fontWeight: 900,
```

---

## Resumen de todos los `borderRadius: 0` a cambiar

Buscar en todo `Deploy.jsx` la cadena `borderRadius: 0` y reemplazar según el contexto:

| Elemento | Nuevo valor |
|---|---|
| Panel principal (`.p-5.sm:p-8`) | `cardRadius` (16) |
| Input de repo URL | `inputRadius` (10) |
| Botón "Cargar Ramas" (va pegado al input) | `0 10 10 0` |
| Select de rama | `inputRadius` (10) |
| Input de subdominio | `10 0 0 10` |
| Span sufijo `.stardest.com` | `0 10 10 0` |
| Botón CTA principal | `btnRadius` (10) |
| Zona drag & drop | 14 |
| Panel de confirmación | 12 |
| Panel de progreso | 12 |
| Panel de éxito / error | 12 |
| Barra de progreso (contenedor) | 99 |
| Barra de progreso (fill) | 99 |
| Botones de acción secundarios (Redeploy, Volver, etc.) | 8–10 |

---

## Qué NO cambiar

- Toda la lógica de estados (`phase`, `uploadPhase`, `progress`, etc.)
- Las funciones `handleFormSubmit`, `loadBranches`, `handleSubdomainChange`, etc.
- Los handlers de drag & drop
- El componente `WebhookInstructions`
- Las variables `--px-*` del CSS global
- La estructura del JSX (secciones, condicionales, etc.)
