# Rediseño: Minimalismo + Animaciones — cambios en todo el sitio

## Resumen de cambios

El diseño base (Inter, JetBrains Mono, dark/light, variables `--px-*`) se mantiene. Los cambios son:

1. **Home.jsx** — eliminar `StatTicker`, refinar hero y secciones, agregar animaciones nuevas
2. **App.jsx** — navbar con transición de opacidad al hacer scroll y línea animada en el item activo
3. **Login.jsx** — agregar efecto de partículas de fondo y micro-animaciones en los botones
4. **Deploy.jsx y Dashboard.jsx** — transición de entrada de página y mejoras de hover

---

## CAMBIO 1 — Home.jsx: eliminar StatTicker

### Qué eliminar

1. El componente completo `StatTicker` (líneas ~143–177)
2. Su única invocación en el JSX:
   ```jsx
   {/* ══ STATS TICKER ════════════════════════════════════════════ */}
   <StatTicker isDark={isDark} />
   ```

No reemplazar por nada — ese espacio queda limpio entre el hero y la sección de steps.

---

## CAMBIO 2 — Home.jsx: agregar animación de número contable bajo el hero

Agregar este componente antes de `FeatureCard`:

```jsx
/* ─── Count-up number ─── */
function CountUp({ end, suffix = '', decimals = 0, duration = 1400 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min((now - t0) / duration, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          setVal(end * ease);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
}
```

Agregar una fila de 3 métricas simples justo **después** del bloque de botones CTA del hero y **antes** del `capLabel` (la línea con el label de capabilities). Insertar:

```jsx
{/* ── Hero micro-stats ── */}
<div className="fade-up fade-up-3" style={{
  display: 'flex', gap: 40, marginTop: 48, flexWrap: 'wrap',
}}>
  {[
    { end: 9, suffix: '+', label: lang === 'es' ? 'Stacks' : 'Stacks' },
    { end: 100, suffix: '%', label: lang === 'es' ? 'Aislado' : 'Isolated' },
    { end: 30, suffix: 's', label: lang === 'es' ? 'Deploy' : 'Deploy' },
  ].map(({ end, suffix, label }) => (
    <div key={label}>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontWeight: 900,
        fontSize: 'clamp(28px, 4vw, 40px)', color: main,
        letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        <CountUp end={end} suffix={suffix} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
        color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5,
      }}>{label}</div>
    </div>
  ))}
</div>
```

---

## CAMBIO 3 — Home.jsx: efecto de cursor magnético en el botón CTA principal

Agregar este hook antes del componente principal `Home`:

```jsx
/* ─── Magnetic button ─── */
function useMagnetic(strength = 0.35) {
  const ref = useRef(null);
  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const onMouseLeave = () => {
    if (ref.current) ref.current.style.transform = 'translate(0,0)';
  };
  return { ref, onMouseMove, onMouseLeave };
}
```

En el botón CTA principal del hero (el `Link to="/deploy"`), agregar el hook y los handlers:

```jsx
// Dentro del componente Home, antes del return:
const magnetic = useMagnetic();

// En el Link principal:
<Link to="/deploy"
  ref={magnetic.ref}
  onMouseMove={magnetic.onMouseMove}
  onMouseLeave={magnetic.onMouseLeave}
  style={{
    // ... estilos ya existentes ...
    transition: 'opacity 0.2s, transform 0.3s cubic-bezier(0.23,1,0.32,1)',
  }}
  // ... resto de props ...
>
```

---

## CAMBIO 4 — Home.jsx: hover con reveal de gradiente en FeatureCard

Reemplazar el `background: hov ? bgHov : bg` dentro de `FeatureCard` por un efecto de gradiente que sigue el cursor:

```jsx
function FeatureCard({ icon, title, desc, num, isDark, delay = 0 }) {
  const [hov, setHov] = useState(false);
  const [pos, setPos]  = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);

  const border    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const borderHov = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
  const bg        = isDark ? '#18181b' : '#ffffff';
  const main      = isDark ? '#fafafa' : '#09090b';

  const handleMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <Reveal delay={delay} style={{ height: '100%' }}>
      <div
        ref={cardRef}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onMouseMove={handleMove}
        style={{
          padding: '28px 24px',
          border: `1px solid ${hov ? borderHov : border}`,
          borderRadius: 10, background: bg,
          boxShadow: hov ? (isDark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.08)') : 'none',
          transform: hov ? 'translateY(-3px)' : 'none',
          transition: 'all 0.25s ease',
          position: 'relative', overflow: 'hidden',
          height: '100%', boxSizing: 'border-box',
        }}
      >
        {/* Gradiente que sigue el cursor */}
        {hov && (
          <div style={{
            position: 'absolute',
            pointerEvents: 'none',
            left: pos.x - 80, top: pos.y - 80,
            width: 160, height: 160,
            borderRadius: '50%',
            background: isDark
              ? 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(0,0,0,0.04) 0%, transparent 70%)',
            transition: 'none',
            zIndex: 0,
          }} />
        )}
        <span style={{ position: 'absolute', top: 20, right: 20, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: hov ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)') : border, transition: 'color 0.25s ease', zIndex: 1 }}>{String(num).padStart(2,'0')}</span>
        <div style={{ marginBottom: 18, color: main, position: 'relative', zIndex: 1 }}>{icon}</div>
        <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 17, color: main, margin: '0 0 10px', letterSpacing: '-0.01em', position: 'relative', zIndex: 1 }}>{title}</h3>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#71717a', margin: 0, lineHeight: 1.65, position: 'relative', zIndex: 1 }}>{desc}</p>
      </div>
    </Reveal>
  );
}
```

---

## CAMBIO 5 — App.jsx: navbar con efecto de scroll blur y línea animada

Agregar un estado de scroll en el componente `Navbar`:

```jsx
// Dentro de Navbar (donde están los useState existentes), agregar:
const [scrolled, setScrolled] = useState(false);
useEffect(() => {
  const onScroll = () => setScrolled(window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

Modificar el `style` del contenedor del navbar para que tenga un blur más pronunciado al hacer scroll:

```jsx
// En el div principal del navbar, cambiar la transición del background:
style={{
  // ... estilos ya existentes ...
  background: scrolled
    ? (isDark ? 'rgba(9,9,11,0.92)' : 'rgba(255,255,255,0.92)')
    : (isDark ? 'rgba(9,9,11,0.6)'  : 'rgba(255,255,255,0.6)'),
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: scrolled
    ? (isDark ? '0 1px 0 rgba(255,255,255,0.06)' : '0 1px 0 rgba(0,0,0,0.06)')
    : 'none',
  transition: 'background 0.3s ease, box-shadow 0.3s ease',
}}
```

Para el item activo del navbar, agregar una línea inferior animada. Buscar donde se renderizan los links del nav (los que van a `/`, `/deploy`, `/dashboard`) y agregar en el link activo:

```jsx
// En cada NavLink o link del navbar, si es la ruta activa, agregar:
style={{
  // ... estilos existentes ...
  position: 'relative',
}}
// Y dentro del elemento activo, agregar:
{isActive && (
  <span style={{
    position: 'absolute', bottom: -2, left: '50%',
    transform: 'translateX(-50%)',
    width: '80%', height: 1,
    background: main,
    animation: 'nav-line-in 0.25s ease forwards',
  }} />
)}
```

Agregar al CSS global (en `App.css` o `index.css`):
```css
@keyframes nav-line-in {
  from { width: 0; opacity: 0; }
  to   { width: 80%; opacity: 1; }
}
```

---

## CAMBIO 6 — Login.jsx: micro-animación en botones OAuth + fondo animado

Reemplazar el componente `OAuthButton` por esta versión mejorada con animación de shimmer al hover:

```jsx
function OAuthButton({ href, icon, label }) {
  const [hov, setHov] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 18px',
        background: hov ? 'var(--px-bg)' : 'transparent',
        border: `1px solid ${hov ? 'var(--px-border-glow)' : 'var(--px-border)'}`,
        borderRadius: 'var(--px-radius-sm)',
        color: hov ? 'var(--px-white)' : 'var(--px-muted)',
        textDecoration: 'none',
        fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 15,
        cursor: 'pointer',
        transform: pressed ? 'scale(0.98)' : hov ? 'scale(1.01)' : 'scale(1)',
        boxShadow: hov ? 'var(--px-shadow-sm)' : 'none',
        transition: 'all 0.18s cubic-bezier(0.23,1,0.32,1)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Shimmer en hover */}
      {hov && (
        <span style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)',
          animation: 'shimmer 0.6s ease forwards',
        }} />
      )}
      <style>{`@keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(200%); } }`}</style>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
        opacity: hov ? 1 : 0,
        transform: hov ? 'translateX(0)' : 'translateX(-6px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}>→</span>
    </a>
  );
}
```

---

## CAMBIO 7 — Transición de entrada de página (App.jsx o CSS global)

Agregar en el CSS global (`App.css` o `index.css`) una animación de fade+slide que se aplica a las páginas al cargar:

```css
/* Animación de entrada de página */
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Aplicar a las páginas principales */
.page-transition {
  animation: page-enter 0.35s cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
```

En `App.jsx`, en el componente que envuelve cada `<Route>`, agregar la clase `page-transition` en el wrapper de cada página. Si las páginas renderizan directamente sin wrapper, agregar a los contenedores raíz de `Home`, `Login`, `Deploy` y `Dashboard`:

```jsx
// En Home.jsx — en el div raíz del return:
<div className="page-transition" style={{ ... }}>

// En Login.jsx — en el div raíz del return:
<div className="page-transition" style={{ ... }}>

// En Deploy.jsx — en el div raíz del return:
<div className="page-transition" style={{ ... }}>

// En Dashboard.jsx — en el div raíz del return:
<div className="page-transition" style={{ ... }}>
```

---

## CAMBIO 8 — Dashboard.jsx y Deploy.jsx: hover lift en cards

En cualquier card del Dashboard (deploy cards, repo cards) y en los paneles del Deploy, agregar estas transiciones de hover si no las tienen ya:

```css
/* En App.css o index.css */
.card-hover {
  transition: transform 0.2s cubic-bezier(0.23,1,0.32,1),
              box-shadow 0.2s cubic-bezier(0.23,1,0.32,1),
              border-color 0.2s ease;
}
.card-hover:hover {
  transform: translateY(-2px);
}
```

Y agregar `className="card-hover"` a los divs de cards en Dashboard y Deploy.

---

## Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `Home.jsx` | Eliminar `StatTicker` + agregar `CountUp` + `useMagnetic` + gradiente en `FeatureCard` |
| `App.jsx` | Navbar con scroll blur + línea activa animada |
| `Login.jsx` | Botón OAuth con shimmer + press scale |
| `App.css` / `index.css` | Agregar keyframes: `page-enter`, `nav-line-in`, `shimmer`, `.card-hover` |
| `Deploy.jsx` | Clase `page-transition` en div raíz |
| `Dashboard.jsx` | Clase `page-transition` en div raíz + `card-hover` en las cards |

## Lo que NO se toca

- Variables CSS `--px-*` existentes
- Sistema de temas dark/light (`getPrefs`, `subscribePrefs`)
- Sistema de i18n (`useTranslation`)
- Componentes `ScatteredChars`, `HeroCircle`, `LiveTerminal`, `Reveal` — ya son buenos
- Fuentes `Inter` y `JetBrains Mono`
- Estructura de secciones de Home (Steps, Features, Terminal, CTA, Footer)
