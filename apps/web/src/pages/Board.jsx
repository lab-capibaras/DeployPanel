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
import VideoBackground from '../components/VideoBackground';
import { useTranslation } from '../i18n';
import { getPrefs, subscribePrefs } from '../store/prefs';

/* ─── Tema ─── */
function useIsDark() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => subscribePrefs(setP), []);
  return p.theme === 'dark';
}

/* ─── API (sesión por cookie httpOnly, igual que el resto del sitio) ─── */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ─── Tipos de componente (los nombres vienen de i18n: t.board.kinds) ─── */
const KINDS = {
  client:   { color: '#a1a1aa', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  frontend: { color: '#60a5fa', icon: 'M3 5h18v12H3zM8 21h8M12 17v4' },
  backend:  { color: '#a78bfa', icon: 'M5 4h14v6H5zM5 14h14v6H5zM8 7h.01M8 17h.01' },
  app:      { color: '#818cf8', icon: 'M4 4h16v16H4zM4 9h16' },
  database: { color: '#34d399', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  cache:    { color: '#f87171', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  worker:   { color: '#fbbf24', icon: 'M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18z' },
  external: { color: '#f472b6', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18' },
  note:     { color: '#facc15', icon: 'M4 4h16v12l-4 4H4zM16 20v-4h4' },
};

const RED = '#ef4444';
const STATUS_COLOR = { running: '#10b981', restarting: RED, degraded: '#f59e0b', exited: '#a1a1aa' };
const EDGE_STYLE = { type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed } };

function KindIcon({ kind, size = 16 }) {
  const k = KINDS[kind] || KINDS.app;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <path d={k.icon} />
    </svg>
  );
}

/* ─── Helpers ─── */
let idCounter = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function makeNode(kind, position, label, extra = {}) {
  return {
    id: newId('n'),
    type: 'stardest',
    position,
    data: { kind, label, notes: '', deploy: '', ...extra },
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

// Genera el diagrama a partir de los deploys: [frontend →] backend/app [→ base de datos]
function buildFromDeploys(deploys, offsetY = 0) {
  const nodes = [];
  const edges = [];
  deploys.forEach((d, row) => {
    const y = offsetY + row * 160;
    let x = 0;
    let prev = null;
    const add = (kind, label) => {
      const node = makeNode(kind, { x, y }, label, { deploy: d.subdomain });
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
  const b = useTranslation().board;
  const statuses = useContext(DeployStatus);
  const k = KINDS[data.kind] || KINDS.app;
  const kindLabel = b.kinds[data.kind] || b.kinds.app;
  const status = data.deploy ? statuses[data.deploy] : null;
  const isNote = data.kind === 'note';

  return (
    <div style={{
      minWidth: 170, maxWidth: 240, padding: '12px 16px', borderRadius: 16,
      background: isNote ? 'rgba(250,204,21,0.12)' : 'var(--px-surface)',
      border: `1px solid ${selected ? k.color : 'var(--px-glass-border)'}`,
      boxShadow: selected ? `0 0 0 3px ${k.color}33` : '0 4px 16px rgba(0,0,0,0.12)',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      {SIDES.map(([id, pos]) => <Handle key={id} id={id} type="source" position={pos} style={handleStyle} />)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KindIcon kind={data.kind} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label || kindLabel}
        </span>
        {data.deploy && (
          <span title={status || b.no_status} style={{
            marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: STATUS_COLOR[status] || '#52525b',
          }} />
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--px-muted)', marginTop: 4 }}>
        {data.deploy ? `${data.deploy}.stardest.com` : kindLabel}
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
  padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${variant === 'danger' ? 'rgba(239,68,68,0.4)' : 'var(--px-border)'}`,
  background: variant === 'primary' ? 'var(--px-white)' : variant === 'danger' ? 'rgba(239,68,68,0.08)' : 'transparent',
  color: variant === 'primary' ? 'var(--px-bg)' : variant === 'danger' ? RED : 'var(--px-white)',
});
const field = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 13, borderRadius: 12, outline: 'none',
  border: '1px solid var(--px-glass-border)', background: 'var(--px-glass-hover)', color: 'var(--px-white)', fontFamily: 'inherit',
};
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--px-muted)', margin: '14px 0 6px' };

/* ─── Editor ─── */
function BoardEditor({ boardId }) {
  const b = useTranslation().board;
  const ins = b.inspector;
  const isDark = useIsDark();
  const navigate = useNavigate();
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deploys, setDeploys] = useState([]);
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
        setSavedSnapshot(serialize(board.name, board.nodes, es));
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

  // Autoguardado: 1.2 s después del último cambio real (seleccionar no cuenta,
  // porque serialize() ignora el estado de selección)
  const snapshot = useMemo(() => serialize(name, nodes, edges), [name, nodes, edges]);
  const dirty = loaded && snapshot !== savedSnapshot;
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => {
      setSaving(true);
      api(`/boards/${boardId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...JSON.parse(snapshot), viewport: getViewport() }),
      })
        .then(() => { setSavedSnapshot(snapshot); setSaveError(false); })
        .catch(() => setSaveError(true))
        .finally(() => setSaving(false));
    }, 1200);
    return () => clearTimeout(t);
  }, [dirty, snapshot, boardId, getViewport]);
  const saveState = saving ? 'saving' : saveError ? 'error' : dirty ? 'pending' : 'saved';

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
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...makeNode(kind, position, b.kinds[kind]), selected: true }]);
  }, [screenToFlowPosition, setNodes, b]);

  // Clic en la paleta: agregar al centro del lienzo
  function addAtCenter(kind) {
    const r = wrapperRef.current.getBoundingClientRect();
    const position = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...makeNode(kind, position, b.kinds[kind]), selected: true }]);
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
      alert(b.no_deploys);
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
    const blob = new Blob([JSON.stringify(JSON.parse(snapshot), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || 'board').replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJson(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('formato');
      if (!confirm(b.confirm_replace)) return;
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
      alert(b.invalid_file);
    }
  }

  return (
    <DeployStatus.Provider value={statuses}>
      <div className="board-root" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--px-bg)' }}>

        {/* Barra superior */}
        <div className="board-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--px-glass-border)', overflowX: 'auto', background: 'var(--px-glass-menu-bg)', backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)' }}>
          <button style={btn()} onClick={() => navigate('/board')}>{b.back}</button>
          <input
            aria-label={b.name_label}
            value={name}
            onChange={e => setName(e.target.value.slice(0, 60))}
            style={{ ...field, width: 220, fontWeight: 700, background: 'transparent', border: '1px solid transparent' }}
            onFocus={e => { e.target.style.borderColor = 'var(--px-border)'; }}
            onBlur={e => { e.target.style.borderColor = 'transparent'; }}
          />
          <span style={{ ...muted, fontSize: 12, color: saveState === 'error' ? RED : 'var(--px-muted)', whiteSpace: 'nowrap' }}>
            {b.save[saveState]}
          </span>
          <span style={{ flex: 1 }} />
          <button style={btn()} onClick={importDeploys}>{b.import_deploys}</button>
          <button className="hide-mobile" style={btn()} onClick={exportJson}>{b.export_json}</button>
          <button className="hide-mobile" style={btn()} onClick={() => fileInput.current?.click()}>{b.import_json}</button>
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
          <aside className="board-palette" style={{ width: 190, flexShrink: 0, padding: 12, borderRight: '1px solid var(--px-glass-border)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--px-glass-bg)', backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)' }}>
            {Object.keys(KINDS).map(kind => (
              <div
                key={kind}
                draggable
                role="button"
                tabIndex={0}
                title={b.palette_title}
                aria-label={b.kinds[kind]}
                onDragStart={e => {
                  e.dataTransfer.setData('application/stardest-kind', kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addAtCenter(kind)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAtCenter(kind); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, cursor: 'grab', border: '1px solid var(--px-glass-border)', background: 'var(--px-glass-hover)', fontSize: 13, color: 'var(--px-white)', userSelect: 'none' }}
              >
                <KindIcon kind={kind} />
                <span className="palette-label">{b.kinds[kind]}</span>
              </div>
            ))}
            <p className="palette-hint" style={{ ...muted, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              {b.palette_hint}
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
            <aside className="board-inspector" style={{ width: 270, flexShrink: 0, padding: 16, borderLeft: '1px solid var(--px-glass-border)', background: 'var(--px-glass-menu-bg)', backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)', overflowY: 'auto' }}>
              {selectedNode && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--px-white)' }}>
                    <KindIcon kind={selectedNode.data.kind} /> {ins.component}
                  </div>

                  <label style={labelStyle} htmlFor="board-node-name">{ins.name}</label>
                  <input id="board-node-name" style={field} value={selectedNode.data.label}
                    onChange={e => updateNodeData(selectedNode.id, { label: e.target.value.slice(0, 80) })} />

                  <label style={labelStyle} htmlFor="board-node-kind">{ins.kind}</label>
                  <select id="board-node-kind" style={field} value={selectedNode.data.kind}
                    onChange={e => updateNodeData(selectedNode.id, { kind: e.target.value })}>
                    {Object.keys(KINDS).map(k => <option key={k} value={k}>{b.kinds[k]}</option>)}
                  </select>

                  <label style={labelStyle} htmlFor="board-node-deploy">{ins.deploy}</label>
                  <select id="board-node-deploy" style={field} value={selectedNode.data.deploy}
                    onChange={e => updateNodeData(selectedNode.id, { deploy: e.target.value })}>
                    <option value="">{ins.unlinked}</option>
                    {deploys.map(d => <option key={d.subdomain} value={d.subdomain}>{d.subdomain}</option>)}
                  </select>
                  {selectedNode.data.deploy && (
                    <a href={`https://${selectedNode.data.deploy}.stardest.com`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--px-white)' }}>
                      {ins.open(selectedNode.data.deploy)}
                    </a>
                  )}

                  <label style={labelStyle} htmlFor="board-node-notes">{ins.notes}</label>
                  <textarea id="board-node-notes" style={{ ...field, minHeight: 90, resize: 'vertical' }} value={selectedNode.data.notes}
                    onChange={e => updateNodeData(selectedNode.id, { notes: e.target.value.slice(0, 1000) })} />

                  <button style={{ ...btn('danger'), marginTop: 18, width: '100%' }} onClick={() => deleteNode(selectedNode.id)}>
                    {ins.delete_node}
                  </button>
                </>
              )}

              {selectedEdge && (
                <>
                  <div style={{ fontWeight: 700, color: 'var(--px-white)' }}>{ins.connection}</div>
                  <label style={labelStyle} htmlFor="board-edge-label">{ins.edge_label}</label>
                  <input id="board-edge-label" style={field} value={selectedEdge.label || ''} placeholder={ins.edge_ph}
                    onChange={e => updateEdge(selectedEdge.id, { label: e.target.value.slice(0, 60) })} />
                  <button style={{ ...btn('danger'), marginTop: 18, width: '100%' }} onClick={() => deleteEdge(selectedEdge.id)}>
                    {ins.delete_edge}
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
  const b = useTranslation().board;
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    api('/boards')
      .then(d => { if (alive) setBoards(d.boards); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  async function create(fromDeploys) {
    try {
      let content = {};
      if (fromDeploys) {
        const d = await api('/deploys');
        if (!d.deploys?.length) {
          alert(b.no_deploys);
          return;
        }
        content = buildFromDeploys(d.deploys);
      }
      const { board } = await api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: fromDeploys ? b.deploys_name : b.default_name, ...content }),
      });
      navigate(`/board/${board.id}`);
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(board) {
    if (!confirm(b.confirm_delete(board.name))) return;
    try {
      await api(`/boards/${board.id}`, { method: 'DELETE' });
      setReloadKey(k => k + 1);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="page-transition" style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
      <VideoBackground veil="strong" />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.035em', margin: 0, color: 'var(--px-white)' }}>{b.title}</h1>
          <p style={{ ...muted, margin: '6px 0 0' }}>{b.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={() => create(true)}>{b.from_deploys}</button>
          <button style={btn('primary')} onClick={() => create(false)}>{b.new_board}</button>
        </div>
      </div>

      {error && <p style={{ color: RED }}>{error}</p>}
      {!boards && !error && <p style={muted}>{b.loading}</p>}

      {boards && boards.length === 0 && (
        <div className="glass" style={{ padding: 48, textAlign: 'center', borderRadius: 24, ...muted }}>
          {b.empty}
        </div>
      )}

      {boards && boards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {boards.map(board => (
            <div key={board.id} className="card-hover" role="link" tabIndex={0}
              onClick={() => navigate(`/board/${board.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/board/${board.id}`); }}
              style={{
                padding: 22, borderRadius: 20, cursor: 'pointer',
                border: '1px solid var(--px-glass-border)', background: 'var(--px-glass-bg)',
                backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)', boxShadow: 'var(--px-glass-shadow)',
              }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</div>
              <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
                {b.components(board.nodeCount)} · {new Date(board.updatedAt).toLocaleDateString()}
              </div>
              <button style={{ ...btn('danger'), marginTop: 14 }} onClick={e => { e.stopPropagation(); remove(board); }}>
                {b.delete}
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
