# Instrucciones: Herramienta Pizarra (Board)

## Qué es

Hoy **Herramientas → Pizarra / Board** apunta a `#`. Este MD la convierte en un editor visual de arquitectura, al estilo de una pizarra de nodos, conectado con StarDest:

- **Lienzo infinito** con zoom, paneo, cuadrícula, minimapa y snap a la cuadrícula.
- **Paleta de componentes** que se arrastran al lienzo (o se agregan con clic): Cliente, Frontend, Backend/API, Aplicación, Base de datos, Caché, Worker/Cola, Servicio externo y Nota.
- **Conexiones** entre componentes desde cualquiera de sus 4 lados, con flecha animada y etiqueta opcional (por ejemplo "REST", "WebSocket").
- **Inspector lateral** para editar nombre, tipo, notas y etiqueta de las conexiones.
- **Vínculo con deploys reales:** cada componente se puede vincular a uno de tus deploys y muestra su estado en vivo (punto verde si está corriendo, rojo si está en reinicio).
- **"Importar mis deploys":** genera el diagrama automáticamente a partir de tus deploys (frontend → backend → base de datos).
- **Varias pizarras por usuario**, con **autoguardado** en el servidor.
- **Exportar e importar** la pizarra como JSON.
- Respeta el **tema claro/oscuro**.

Se usa **React Flow** (`@xyflow/react`), la librería estándar para editores de nodos en React.

---

## PASO 1 — Servidor: carpeta de persistencia

Cada usuario guarda sus pizarras en un archivo propio dentro de una carpeta montada como volumen. Es una carpeta y no un archivo suelto para poder escribir de forma atómica (archivo temporal + `rename`). Además, `deploy_panel` corre como usuario sin privilegios, así que la carpeta necesita permisos de escritura.

```bash
mkdir -p ~/deploys/boards && chmod 777 ~/deploys/boards
```

En `~/deploys/docker-compose.yml`, en los `volumes` del servicio `deploy_panel`:

```yaml
      - ./boards:/home/project/deploys/boards
```

Este paso se aplica junto con el rebuild del paso 2:

```bash
cd ~/deploys && docker compose up -d deploy_panel
docker exec deploy_panel sh -c 'touch /home/project/deploys/boards/.t && rm /home/project/deploys/boards/.t && echo escritura ok'
```

---

## PASO 2 — Backend: `deploy_panel/apps/builder/index.js`

### 2a. Límite del body JSON

Una pizarra grande puede pasar del límite por defecto de Express (100 KB). Cambiar:

```javascript
// ANTES:
app.use(express.json());

// DESPUÉS:
app.use(express.json({ limit: '1mb' }));
```

Si el archivo no importa `crypto` arriba, agregar junto a los demás `require`:

```javascript
const crypto = require('crypto');
```

### 2b. Sección Board

Agregar antes de `app.listen(...)`. Reutiliza `getRequestUser`, definida en la sección de la Console.

```javascript
// ==========================================
// --- BOARD (pizarra de arquitectura) ---
// ==========================================
const BOARDS_DIR = path.join(process.env.DEPLOYS_DIR || '/home/project/deploys', 'boards');
const BOARD_KINDS = ['client', 'frontend', 'backend', 'app', 'database', 'cache', 'worker', 'external', 'note'];
const MAX_BOARDS_PER_USER = 20;
const MAX_BOARD_NODES = 300;
const MAX_BOARD_EDGES = 600;

function requireUser(req, res, next) {
    const user = getRequestUser(req);
    if (!user?.id) return res.status(401).json({ error: 'No autenticado' });
    req.user = user;
    next();
}

// Un archivo por usuario. Se incluye el provider para que IDs de Google y GitHub nunca choquen.
function boardsFile(user) {
    const safe = `${user.provider || 'user'}-${String(user.id)}`.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(BOARDS_DIR, `${safe}.json`);
}

function readUserBoards(user) {
    try {
        return JSON.parse(fs.readFileSync(boardsFile(user), 'utf8'));
    } catch {
        return [];
    }
}

function writeUserBoards(user, boards) {
    fs.mkdirSync(BOARDS_DIR, { recursive: true });
    const file = boardsFile(user);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(boards));
    fs.renameSync(tmp, file); // escritura atómica: nunca queda un archivo a medias
}

const clampStr = (v, max) => String(v ?? '').slice(0, max);
const boardNum = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);

// Nunca se guarda lo que manda el cliente tal cual: se normaliza y se limita
function sanitizeBoardContent({ nodes = [], edges = [], viewport = {} } = {}) {
    const cleanNodes = (Array.isArray(nodes) ? nodes : []).slice(0, MAX_BOARD_NODES).map(n => ({
        id: clampStr(n?.id, 64),
        type: 'stardest',
        position: { x: boardNum(n?.position?.x), y: boardNum(n?.position?.y) },
        data: {
            kind: BOARD_KINDS.includes(n?.data?.kind) ? n.data.kind : 'app',
            label: clampStr(n?.data?.label, 80),
            notes: clampStr(n?.data?.notes, 1000),
            deploy: /^[a-z0-9-]{0,40}$/.test(n?.data?.deploy || '') ? (n?.data?.deploy || '') : '',
        },
    })).filter(n => n.id);

    const ids = new Set(cleanNodes.map(n => n.id));
    const cleanEdges = (Array.isArray(edges) ? edges : []).slice(0, MAX_BOARD_EDGES).map(e => ({
        id: clampStr(e?.id, 140),
        source: clampStr(e?.source, 64),
        target: clampStr(e?.target, 64),
        sourceHandle: e?.sourceHandle ? clampStr(e.sourceHandle, 16) : null,
        targetHandle: e?.targetHandle ? clampStr(e.targetHandle, 16) : null,
        label: clampStr(e?.label, 60),
    })).filter(e => e.id && ids.has(e.source) && ids.has(e.target));

    return {
        nodes: cleanNodes,
        edges: cleanEdges,
        viewport: {
            x: boardNum(viewport?.x),
            y: boardNum(viewport?.y),
            zoom: Math.min(4, Math.max(0.1, boardNum(viewport?.zoom) || 1)),
        },
    };
}

// Listar pizarras del usuario
app.get('/boards', requireUser, (req, res) => {
    const boards = readUserBoards(req.user)
        .map(({ id, name, updatedAt, nodes }) => ({ id, name, updatedAt, nodeCount: nodes.length }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ boards });
});

// Crear pizarra (vacía o con contenido inicial)
app.post('/boards', requireUser, (req, res) => {
    try {
        const boards = readUserBoards(req.user);
        if (boards.length >= MAX_BOARDS_PER_USER) {
            return res.status(400).json({ error: `Máximo ${MAX_BOARDS_PER_USER} pizarras por usuario` });
        }
        const now = new Date().toISOString();
        const board = {
            id: crypto.randomUUID(),
            name: clampStr(req.body?.name || 'Nueva pizarra', 60),
            createdAt: now,
            updatedAt: now,
            ...sanitizeBoardContent(req.body),
        };
        boards.push(board);
        writeUserBoards(req.user, boards);
        res.status(201).json({ board });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obtener una pizarra
app.get('/boards/:id', requireUser, (req, res) => {
    const board = readUserBoards(req.user).find(b => b.id === req.params.id);
    if (!board) return res.status(404).json({ error: 'Pizarra no encontrada' });
    res.json({ board });
});

// Guardar (autoguardado desde el editor)
app.put('/boards/:id', requireUser, (req, res) => {
    try {
        const boards = readUserBoards(req.user);
        const i = boards.findIndex(b => b.id === req.params.id);
        if (i === -1) return res.status(404).json({ error: 'Pizarra no encontrada' });
        boards[i] = {
            ...boards[i],
            ...sanitizeBoardContent(req.body),
            name: req.body?.name ? clampStr(req.body.name, 60) : boards[i].name,
            updatedAt: new Date().toISOString(),
        };
        writeUserBoards(req.user, boards);
        res.json({ updatedAt: boards[i].updatedAt });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar
app.delete('/boards/:id', requireUser, (req, res) => {
    const boards = readUserBoards(req.user);
    const next = boards.filter(b => b.id !== req.params.id);
    if (next.length === boards.length) return res.status(404).json({ error: 'Pizarra no encontrada' });
    writeUserBoards(req.user, next);
    res.json({ ok: true });
});
```

---

## PASO 3 — Frontend

### 3a. Dependencia

En `deploy_panel/apps/web`:

```bash
npm install @xyflow/react
```

### 3b. Rutas y menú en `App.jsx`

```jsx
import Board from './pages/Board';
// ...
<Route path="/board" element={<Board />} />
<Route path="/board/:id" element={<Board />} />
```

En `NAV_TOOLS`, cambiar `to: '#'` por `to: '/board'` en el item **Pizarra** (`es`) y en **Board** (`en`). Los demás items quedan igual.

### 3c. Crear `deploy_panel/apps/web/src/pages/Board.jsx`

```jsx
// Board.jsx — Pizarra de arquitectura de StarDest
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, ConnectionMode, MarkerType, addEdge,
  useNodesState, useEdgesState, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '../hooks/useAuth';
import { getPrefs, subscribePrefs } from '../store/prefs';

/* ─── Tema ─── */
function useIsDark() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => subscribePrefs(setP), []);
  return p.theme === 'dark';
}

/* ─── API ─── */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ─── Tipos de componente ─── */
const KINDS = {
  client:   { label: 'Cliente',          color: '#a1a1aa', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  frontend: { label: 'Frontend',         color: '#60a5fa', icon: 'M3 5h18v12H3zM8 21h8M12 17v4' },
  backend:  { label: 'Backend / API',    color: '#a78bfa', icon: 'M5 4h14v6H5zM5 14h14v6H5zM8 7h.01M8 17h.01' },
  app:      { label: 'Aplicación',       color: '#818cf8', icon: 'M4 4h16v16H4zM4 9h16' },
  database: { label: 'Base de datos',    color: '#34d399', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  cache:    { label: 'Caché',            color: '#f87171', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  worker:   { label: 'Worker / Cola',    color: '#fbbf24', icon: 'M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18z' },
  external: { label: 'Servicio externo', color: '#f472b6', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18' },
  note:     { label: 'Nota',             color: '#facc15', icon: 'M4 4h16v12l-4 4H4zM16 20v-4h4' },
};

const STATUS_COLOR = { running: '#22c55e', restarting: '#f87171', degraded: '#fbbf24', exited: '#a1a1aa' };
const EDGE_STYLE = { type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed } };
const SAVE_LABEL = { saved: 'Guardado', pending: 'Cambios sin guardar', saving: 'Guardando...', error: 'Error al guardar' };

function KindIcon({ kind, size = 16 }) {
  const k = KINDS[kind] || KINDS.app;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={k.icon} />
    </svg>
  );
}

/* ─── Helpers ─── */
let idCounter = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function makeNode(kind, position, extra = {}) {
  return {
    id: newId('n'),
    type: 'stardest',
    position,
    data: { kind, label: KINDS[kind].label, notes: '', deploy: '', ...extra },
  };
}

// Lo que se guarda: sin estado de selección, medidas ni estilos
function serialize(name, nodes, edges) {
  return JSON.stringify({
    name,
    nodes: nodes.map(n => ({
      id: n.id,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: { kind: n.data.kind, label: n.data.label, notes: n.data.notes, deploy: n.data.deploy },
    })),
    edges: edges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
      label: e.label || '',
    })),
  });
}

// Genera el diagrama a partir de los deploys del usuario: [frontend →] backend/app [→ base de datos]
function buildFromDeploys(deploys, offsetY = 0) {
  const nodes = [];
  const edges = [];
  deploys.forEach((d, row) => {
    const y = offsetY + row * 160;
    let x = 0;
    let prev = null;
    const add = (kind, label) => {
      const node = makeNode(kind, { x, y }, { label, deploy: d.subdomain });
      nodes.push(node);
      if (prev) {
        edges.push({ id: newId('e'), source: prev, target: node.id, sourceHandle: 'right', targetHandle: 'left', label: '' });
      }
      prev = node.id;
      x += 280;
    };
    const roles = d.roles || [];
    if (roles.includes('frontend') && roles.includes('backend')) {
      add('frontend', `${d.subdomain} · web`);
      add('backend', `${d.subdomain} · api`);
    } else {
      add('app', d.subdomain);
    }
    if (d.database) add('database', `${d.subdomain} · ${d.database.type}`);
  });
  return { nodes, edges };
}

/* ─── Nodo personalizado ─── */
const DeployStatus = createContext({});
const handleStyle = { width: 8, height: 8, background: 'var(--px-muted)', border: 'none' };
const SIDES = [
  ['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left],
];

function StarDestNode({ data, selected }) {
  const statuses = useContext(DeployStatus);
  const k = KINDS[data.kind] || KINDS.app;
  const status = data.deploy ? statuses[data.deploy] : null;
  const isNote = data.kind === 'note';

  return (
    <div style={{
      minWidth: 170, maxWidth: 240, padding: '10px 14px', borderRadius: 12,
      background: isNote ? 'rgba(250,204,21,0.12)' : 'var(--px-surface)',
      border: `1px solid ${selected ? k.color : 'var(--px-border)'}`,
      boxShadow: selected ? `0 0 0 3px ${k.color}33` : '0 4px 16px rgba(0,0,0,0.12)',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      {SIDES.map(([id, pos]) => <Handle key={id} id={id} type="source" position={pos} style={handleStyle} />)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KindIcon kind={data.kind} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label || k.label}
        </span>
        {data.deploy && (
          <span title={status || 'sin estado'} style={{
            marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: STATUS_COLOR[status] || '#52525b',
          }} />
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--px-muted)', marginTop: 4 }}>
        {data.deploy ? `${data.deploy}.stardest.com` : k.label}
      </div>
      {data.notes && (
        <div style={{ fontSize: 11, color: 'var(--px-muted)', marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
          {data.notes}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { stardest: StarDestNode }; // fuera del componente para que no se recree

/* ─── Estilos ─── */
const muted = { color: 'var(--px-muted)', fontSize: 13 };
const btn = (variant = 'default') => ({
  padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${variant === 'danger' ? 'rgba(239,68,68,0.4)' : 'var(--px-border)'}`,
  background: variant === 'primary' ? 'var(--px-white)' : variant === 'danger' ? 'rgba(239,68,68,0.08)' : 'transparent',
  color: variant === 'primary' ? 'var(--px-bg)' : variant === 'danger' ? '#f87171' : 'var(--px-white)',
});
const field = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, borderRadius: 8, outline: 'none',
  border: '1px solid var(--px-border)', background: 'var(--px-bg)', color: 'var(--px-white)', fontFamily: 'inherit',
};
const label = { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--px-muted)', margin: '14px 0 6px' };

const RESPONSIVE_CSS = `
  @media (max-width: 768px) {
    .board-root { padding-bottom: 64px !important; }
    .board-palette { width: 52px !important; padding: 8px 6px !important; }
    .board-palette .palette-label, .board-palette .palette-hint { display: none; }
    .board-inspector { position: absolute; right: 0; top: 0; bottom: 0; z-index: 5; }
    .board-toolbar .hide-mobile { display: none; }
  }
`;

/* ─── Editor ─── */
function BoardEditor({ boardId }) {
  const isDark = useIsDark();
  const navigate = useNavigate();
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [deploys, setDeploys] = useState([]);
  const lastSaved = useRef('');
  const wrapperRef = useRef(null);
  const fileInput = useRef(null);

  // Cargar la pizarra
  useEffect(() => {
    let alive = true;
    api(`/boards/${boardId}`)
      .then(({ board }) => {
        if (!alive) return;
        const es = board.edges.map(e => ({ ...e, ...EDGE_STYLE }));
        setNodes(board.nodes);
        setEdges(es);
        setName(board.name);
        lastSaved.current = serialize(board.name, board.nodes, es);
        setLoaded(true);
        setTimeout(() => fitView({ padding: 0.2 }), 80);
      })
      .catch(() => navigate('/board'));
    return () => { alive = false; };
  }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estado en vivo de los deploys del usuario
  useEffect(() => {
    const load = () => api('/deploys').then(d => setDeploys(d.deploys || [])).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  const statuses = useMemo(() => Object.fromEntries(deploys.map(d => [d.subdomain, d.status])), [deploys]);

  // Autoguardado: 1.2 s después del último cambio real (seleccionar no cuenta)
  useEffect(() => {
    if (!loaded) return undefined;
    const snapshot = serialize(name, nodes, edges);
    if (snapshot === lastSaved.current) return undefined;
    setSaveState('pending');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api(`/boards/${boardId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...JSON.parse(snapshot), viewport: getViewport() }),
        });
        lastSaved.current = snapshot;
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [nodes, edges, name, loaded, boardId, getViewport]);

  // Conectar componentes
  const onConnect = useCallback(
    (params) => setEdges(eds => addEdge({ ...params, id: newId('e'), label: '', ...EDGE_STYLE }, eds)),
    [setEdges],
  );

  // Arrastrar desde la paleta
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/stardest-kind');
    if (!KINDS[kind]) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...makeNode(kind, position), selected: true }]);
  }, [screenToFlowPosition, setNodes]);

  // Clic en la paleta: agregar al centro del lienzo
  function addAtCenter(kind) {
    const r = wrapperRef.current.getBoundingClientRect();
    const position = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...makeNode(kind, position), selected: true }]);
  }

  // Edición desde el inspector
  const selectedNode = nodes.find(n => n.selected);
  const selectedEdge = selectedNode ? null : edges.find(e => e.selected);
  const updateNodeData = (id, patch) => setNodes(ns => ns.map(n => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const updateEdge = (id, patch) => setEdges(es => es.map(e => (e.id === id ? { ...e, ...patch } : e)));
  const deleteNode = (id) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  };
  const deleteEdge = (id) => setEdges(es => es.filter(e => e.id !== id));

  // Importar deploys reales al lienzo
  function importDeploys() {
    if (!deploys.length) {
      alert('No tienes deploys todavía.');
      return;
    }
    const offsetY = nodes.length ? Math.max(...nodes.map(n => n.position.y)) + 200 : 0;
    const built = buildFromDeploys(deploys, offsetY);
    setNodes(cur => [...cur, ...built.nodes]);
    setEdges(cur => [...cur, ...built.edges.map(e => ({ ...e, ...EDGE_STYLE }))]);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 80);
  }

  // Exportar / importar JSON
  function exportJson() {
    const blob = new Blob([JSON.stringify(JSON.parse(serialize(name, nodes, edges)), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || 'pizarra').replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJson(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('formato');
      if (!confirm('Esto reemplaza el contenido de la pizarra actual. ¿Continuar?')) return;
      setNodes(d.nodes.map(n => ({
        id: String(n.id),
        type: 'stardest',
        position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
        data: {
          kind: KINDS[n.data?.kind] ? n.data.kind : 'app',
          label: String(n.data?.label || ''),
          notes: String(n.data?.notes || ''),
          deploy: String(n.data?.deploy || ''),
        },
      })));
      setEdges(d.edges.map(e => ({
        id: String(e.id), source: String(e.source), target: String(e.target),
        sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
        label: String(e.label || ''), ...EDGE_STYLE,
      })));
      setTimeout(() => fitView({ padding: 0.2 }), 80);
    } catch {
      alert('El archivo no es una pizarra válida.');
    }
  }

  return (
    <DeployStatus.Provider value={statuses}>
      <style>{RESPONSIVE_CSS}</style>
      <div className="board-root" style={{ position: 'fixed', inset: 0, paddingTop: 72, display: 'flex', flexDirection: 'column', background: 'var(--px-bg)' }}>

        {/* Barra superior */}
        <div className="board-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--px-border)', overflowX: 'auto' }}>
          <button style={btn()} onClick={() => navigate('/board')}>← Pizarras</button>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 60))}
            style={{ ...field, width: 220, fontWeight: 700, background: 'transparent', border: '1px solid transparent' }}
            onFocus={e => { e.target.style.borderColor = 'var(--px-border)'; }}
            onBlur={e => { e.target.style.borderColor = 'transparent'; }}
          />
          <span style={{ ...muted, fontSize: 12, color: saveState === 'error' ? '#f87171' : 'var(--px-muted)', whiteSpace: 'nowrap' }}>
            {SAVE_LABEL[saveState]}
          </span>
          <span style={{ flex: 1 }} />
          <button style={btn()} onClick={importDeploys}>Importar mis deploys</button>
          <button className="hide-mobile" style={btn()} onClick={exportJson}>Exportar</button>
          <button className="hide-mobile" style={btn()} onClick={() => fileInput.current?.click()}>Importar JSON</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>

          {/* Paleta */}
          <aside className="board-palette" style={{ width: 190, flexShrink: 0, padding: 12, borderRight: '1px solid var(--px-border)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(KINDS).map(([kind, k]) => (
              <div
                key={kind}
                draggable
                title="Arrastra al lienzo o haz clic"
                onDragStart={e => {
                  e.dataTransfer.setData('application/stardest-kind', kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addAtCenter(kind)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'grab', border: '1px solid var(--px-border)', background: 'var(--px-surface)', fontSize: 13, color: 'var(--px-white)', userSelect: 'none' }}
              >
                <KindIcon kind={kind} />
                <span className="palette-label">{k.label}</span>
              </div>
            ))}
            <p className="palette-hint" style={{ ...muted, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              Une componentes arrastrando desde sus bordes. Supr o Backspace elimina lo seleccionado.
            </p>
          </aside>

          {/* Lienzo */}
          <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              connectionMode={ConnectionMode.Loose}
              colorMode={isDark ? 'dark' : 'light'}
              deleteKeyCode={['Backspace', 'Delete']}
              snapToGrid
              snapGrid={[16, 16]}
              style={{ background: 'var(--px-bg)' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls />
              <MiniMap pannable zoomable nodeColor={n => (KINDS[n.data?.kind] || KINDS.app).color} />
            </ReactFlow>
          </div>

          {/* Inspector */}
          {(selectedNode || selectedEdge) && (
            <aside className="board-inspector" style={{ width: 270, flexShrink: 0, padding: 16, borderLeft: '1px solid var(--px-border)', background: 'var(--px-surface)', overflowY: 'auto' }}>
              {selectedNode && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--px-white)' }}>
                    <KindIcon kind={selectedNode.data.kind} /> Componente
                  </div>

                  <label style={label}>Nombre</label>
                  <input style={field} value={selectedNode.data.label}
                    onChange={e => updateNodeData(selectedNode.id, { label: e.target.value.slice(0, 80) })} />

                  <label style={label}>Tipo</label>
                  <select style={field} value={selectedNode.data.kind}
                    onChange={e => updateNodeData(selectedNode.id, { kind: e.target.value })}>
                    {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>

                  <label style={label}>Deploy vinculado</label>
                  <select style={field} value={selectedNode.data.deploy}
                    onChange={e => updateNodeData(selectedNode.id, { deploy: e.target.value })}>
                    <option value="">Sin vincular</option>
                    {deploys.map(d => <option key={d.subdomain} value={d.subdomain}>{d.subdomain}</option>)}
                  </select>
                  {selectedNode.data.deploy && (
                    <a href={`https://${selectedNode.data.deploy}.stardest.com`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--px-white)' }}>
                      Abrir {selectedNode.data.deploy}.stardest.com →
                    </a>
                  )}

                  <label style={label}>Notas</label>
                  <textarea style={{ ...field, minHeight: 90, resize: 'vertical' }} value={selectedNode.data.notes}
                    onChange={e => updateNodeData(selectedNode.id, { notes: e.target.value.slice(0, 1000) })} />

                  <button style={{ ...btn('danger'), marginTop: 18, width: '100%' }} onClick={() => deleteNode(selectedNode.id)}>
                    Eliminar componente
                  </button>
                </>
              )}

              {selectedEdge && (
                <>
                  <div style={{ fontWeight: 700, color: 'var(--px-white)' }}>Conexión</div>
                  <label style={label}>Etiqueta</label>
                  <input style={field} value={selectedEdge.label || ''} placeholder="Ej. REST, WebSocket, SQL"
                    onChange={e => updateEdge(selectedEdge.id, { label: e.target.value.slice(0, 60) })} />
                  <button style={{ ...btn('danger'), marginTop: 18, width: '100%' }} onClick={() => deleteEdge(selectedEdge.id)}>
                    Eliminar conexión
                  </button>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </DeployStatus.Provider>
  );
}

/* ─── Lista de pizarras ─── */
function BoardList() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/boards').then(d => setBoards(d.boards)).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(fromDeploys) {
    try {
      let content = {};
      if (fromDeploys) {
        const d = await api('/deploys');
        if (!d.deploys?.length) {
          alert('No tienes deploys todavía.');
          return;
        }
        content = buildFromDeploys(d.deploys);
      }
      const { board } = await api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: fromDeploys ? 'Mis deploys' : 'Nueva pizarra', ...content }),
      });
      navigate(`/board/${board.id}`);
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(b) {
    if (!confirm(`¿Eliminar "${b.name}"?`)) return;
    try {
      await api(`/boards/${b.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="page-transition" style={{ maxWidth: 1100, margin: '0 auto', padding: '110px 24px 80px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: 'var(--px-white)' }}>Pizarra</h1>
          <p style={{ ...muted, margin: '6px 0 0' }}>Diseña la arquitectura de tus proyectos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={() => create(true)}>Desde mis deploys</button>
          <button style={btn('primary')} onClick={() => create(false)}>+ Nueva pizarra</button>
        </div>
      </div>

      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {!boards && !error && <p style={muted}>Cargando...</p>}

      {boards && boards.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 16, border: '1px dashed var(--px-border)', ...muted }}>
          Aún no tienes pizarras. Crea una vacía o genera una desde tus deploys.
        </div>
      )}

      {boards && boards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {boards.map(b => (
            <div key={b.id} className="card-hover" onClick={() => navigate(`/board/${b.id}`)}
              style={{ padding: 20, borderRadius: 14, cursor: 'pointer', border: '1px solid var(--px-border)', background: 'var(--px-surface)' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
              <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
                {b.nodeCount} componente{b.nodeCount === 1 ? '' : 's'} · {new Date(b.updatedAt).toLocaleDateString()}
              </div>
              <button style={{ ...btn('danger'), marginTop: 14 }} onClick={e => { e.stopPropagation(); remove(b); }}>
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Página ─── */
export default function Board() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  if (loading || !user) return null;
  if (!id) return <BoardList />;
  return (
    <ReactFlowProvider key={id}>
      <BoardEditor boardId={id} />
    </ReactFlowProvider>
  );
}
```

---

## Resumen de cambios

| Acción | Archivo / lugar |
|---|---|
| Servidor | Crear `~/deploys/boards` con `chmod 777` y montarla en `deploy_panel` |
| Modificar | `apps/builder/index.js`: `express.json({ limit: '1mb' })` y `require('crypto')` si falta |
| Agregar | `apps/builder/index.js`: sección Board (`requireUser`, saneamiento, endpoints `GET/POST /boards`, `GET/PUT/DELETE /boards/:id`) |
| Instalar | `@xyflow/react` en `apps/web` |
| Crear | `apps/web/src/pages/Board.jsx` |
| Modificar | `apps/web/src/App.jsx`: rutas `/board` y `/board/:id`; `NAV_TOOLS` Pizarra/Board → `/board` |

## Cómo probarlo

1. **Herramientas → Pizarra** → **Desde mis deploys**. Debe generar un diagrama con tus deploys reales y un punto de estado en cada componente.
2. Arrastra un **Caché** desde la paleta y conéctalo arrastrando desde el borde de un componente a otro. Selecciona la conexión y ponle la etiqueta "Redis".
3. Recarga la página: todo debe seguir ahí. En la barra superior debe decir **Guardado**.
4. Revisa en el servidor que se creó el archivo:

```bash
ls -la ~/deploys/boards/
```

## Notas

- **Cada usuario solo ve sus propias pizarras:** el archivo se elige con el `provider` e `id` del JWT, nunca con datos del cliente.
- **El backend sanea todo antes de guardar:** tipos de componente válidos, textos con longitud máxima, conexiones solo entre componentes existentes, y máximo 300 componentes, 600 conexiones y 20 pizarras por usuario.
- **El estado de los deploys no se guarda en la pizarra:** se consulta en vivo cada 20 segundos desde `/api/deploys`, así que siempre refleja el estado actual.
- **"Importar mis deploys"** usa el campo `roles` de `/deploys` para detectar si un deploy tiene frontend y backend separados. Si ese campo no existe, crea un solo componente "Aplicación" por deploy.
- **En móvil** la paleta se reduce a íconos y el inspector aparece encima del lienzo. Se edita mejor en escritorio.
- **Mejora futura:** exportar a PNG con `html-to-image`, siguiendo el ejemplo oficial de React Flow.
