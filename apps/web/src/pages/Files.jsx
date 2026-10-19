// Files.jsx — Gestor de archivos de StarDest (solo admin, sin TOTP)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import VideoBackground from '../components/VideoBackground';
import FileEditor from '../components/FileEditor';

const CHUNK = 20 * 1024 * 1024; // Cloudflare rechaza cuerpos de más de 100 MB: se sube por trozos

/* ─── API (sesión por cookie httpOnly, igual que el resto del sitio) ─── */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status, body: data });
  return data;
}

// Un trozo con XHR, que sí informa del progreso de la subida
function putChunk(uploadId, offset, blob, onProgress, onXhr) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open('PUT', `/api/admin/files/upload/${uploadId}?offset=${offset}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* respuesta sin JSON */ }
      if (xhr.status === 200) resolve(body);
      else reject(Object.assign(new Error(body.error || `Error ${xhr.status}`), { status: xhr.status, body }));
    };
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.onabort = () => reject(new Error('Cancelado'));
    xhr.send(blob);
  });
}

/* ─── Archivos de texto que se abren en el editor ─── */
// Extensiones y nombres que se ofrecen para editar. El servidor igual rechaza binarios y UTF-8 inválido.
const EDITABLE_EXT = new Set([
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonc', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'svg',
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'dart', 'c', 'h', 'cpp', 'hpp', 'cs', 'swift', 'lua', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat',
]);
const EDITABLE_NAMES = new Set(['dockerfile', 'makefile', 'procfile', '.env', '.gitignore', '.dockerignore', '.htaccess', '.editorconfig', '.npmrc', '.nvmrc']);

function isEditable(name) {
  const lower = name.toLowerCase();
  if (EDITABLE_NAMES.has(lower) || lower.startsWith('.env.')) return true;
  const dot = lower.lastIndexOf('.');
  return dot > 0 && EDITABLE_EXT.has(lower.slice(dot + 1));
}

/* ─── Formato ─── */
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
function fmtDate(v) {
  const d = new Date(v);
  return `${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/* ─── Estilos (tokens del sitio: glass + pastillas) ─── */
const RED = '#ef4444', GREEN = '#10b981', AMBER = '#f59e0b';
const glass = {
  background: 'var(--px-glass-bg)', border: '1px solid var(--px-glass-border)', borderRadius: 20,
  boxShadow: 'var(--px-glass-shadow)', backdropFilter: 'var(--px-glass-blur)', WebkitBackdropFilter: 'var(--px-glass-blur)',
};
const muted = { color: 'var(--px-muted)', fontSize: 13 };
const btn = (variant = 'default') => ({
  padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  border: `1px solid ${variant === 'primary' ? 'var(--px-accent)' : variant === 'danger' ? 'rgba(239,68,68,0.4)' : 'var(--px-glass-border)'}`,
  background: variant === 'primary' ? 'var(--px-accent)' : variant === 'danger' ? 'rgba(239,68,68,0.08)' : 'var(--px-glass-hover)',
  color: variant === 'primary' ? 'var(--px-accent-fg)' : variant === 'danger' ? RED : 'var(--px-white)',
});
const linkBtn = { background: 'none', border: 'none', padding: '2px 6px', fontSize: 12, cursor: 'pointer', color: 'var(--px-muted)', fontFamily: 'inherit' };
const thStyle = { textAlign: 'left', padding: '12px 14px', fontSize: 12, fontWeight: 600, color: 'var(--px-muted)', userSelect: 'none' };
const tdStyle = { padding: '11px 14px', fontSize: 13, color: 'var(--px-white)', borderTop: '1px solid var(--px-glass-border)' };

const CSS = `
  @media (max-width: 720px) {
    .files-col-size, .files-col-date { display: none; }
    /* En móvil las acciones van en columna: si no, le quitan casi todo el ancho al nombre */
    .files-actions { white-space: normal !important; width: 84px; }
    .files-actions button { display: block; margin-left: auto; padding: 3px 0 !important; }
  }
`;

function Icon({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dir ? 'var(--px-accent)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: dir ? 1 : 0.8 }}>
      {dir
        ? <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        : <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></>}
    </svg>
  );
}

export default function Files() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [cwd, setCwd] = useState('');
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null);   // ruta del archivo abierto en el editor

  const cwdRef = useRef('');
  const fileInput = useRef(null);
  const queue = useRef([]);
  const running = useRef(false);
  const cancelled = useRef(new Set());
  const xhrs = useRef({});
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate('/');
  }, [user, authLoading, navigate]);

  // Listado de la carpeta actual (se recarga al cambiar de carpeta o tras una acción)
  useEffect(() => {
    if (!user?.isAdmin) return undefined;
    cwdRef.current = cwd;
    let alive = true;
    api(`/admin/files/list?path=${encodeURIComponent(cwd)}`)
      .then((d) => { if (alive) { setData(d); setError(''); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [cwd, user, reloadKey]);

  useEffect(() => {
    if (!user?.isAdmin) return undefined;
    let alive = true;
    api('/admin/files/usage').then((u) => { if (alive) setUsage(u); }).catch(() => {});
    return () => { alive = false; };
  }, [user, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  // Cambiar de carpeta limpia la selección y el filtro
  const goTo = (dir) => { setCwd(dir); setSelected(new Set()); setFilter(''); };

  // Avisar si se intenta cerrar la pestaña con subidas en curso
  useEffect(() => {
    if (!uploads.some(u => u.status === 'queued' || u.status === 'uploading')) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploads]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      size: (a, b) => (a.size ?? -1) - (b.size ?? -1),
      modified: (a, b) => a.modified.localeCompare(b.modified),
    }[sort.key];
    return data.items
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => (a.type === b.type ? cmp(a, b) * sort.dir : a.type === 'dir' ? -1 : 1));
  }, [data, filter, sort]);

  const join = (name) => (cwd ? `${cwd}/${name}` : name);

  /* ─── Acciones ─── */
  async function run(fn) {
    try { await fn(); } catch (e) { alert(e.message); }
  }

  const newFolder = () => run(async () => {
    const name = prompt('Nombre de la carpeta:');
    if (!name) return;
    await api('/admin/files/mkdir', { method: 'POST', body: JSON.stringify({ path: cwd, name }) });
    reload();
  });

  const newFile = () => run(async () => {
    const name = prompt('Nombre del archivo (ej. notas.txt, index.html):');
    if (!name) return;
    const rel = join(name.trim());
    const res = await fetch(`/api/admin/files/content?path=${encodeURIComponent(rel)}&create=1`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: '',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
    reload();
    setEditing(rel);
  });

  const rename = (item) => run(async () => {
    const name = prompt('Nuevo nombre:', item.name);
    if (!name || name === item.name) return;
    await api('/admin/files/move', { method: 'POST', body: JSON.stringify({ from: join(item.name), to: join(name) }) });
    reload();
  });

  const move = (items) => run(async () => {
    const dest = prompt('Mover a la carpeta (ruta desde la raíz, vacío = raíz):', '');
    if (dest === null) return;
    const base = dest.split('/').filter(Boolean).join('/');
    for (const it of items) {
      await api('/admin/files/move', { method: 'POST', body: JSON.stringify({ from: join(it.name), to: base ? `${base}/${it.name}` : it.name }) });
    }
    setSelected(new Set());
    reload();
  });

  const remove = (items) => run(async () => {
    const what = items.length === 1 ? `"${items[0].name}"` : `${items.length} elementos`;
    if (!confirm(`¿Eliminar ${what}? Las carpetas se borran con todo su contenido.`)) return;
    await api('/admin/files/delete', { method: 'POST', body: JSON.stringify({ paths: items.map(i => join(i.name)) }) });
    setSelected(new Set());
    reload();
  });

  async function getLink(item, inline) {
    const { url } = await api('/admin/files/link', { method: 'POST', body: JSON.stringify({ path: join(item.name), inline }) });
    return url;
  }

  // Se abre la pestaña de inmediato (dentro del clic) para que el navegador no la bloquee
  const openFile = async (item) => {
    const win = window.open('', '_blank');
    try {
      const url = await getLink(item, true);
      if (win) win.location.href = url; else window.location.assign(url);
    } catch (e) {
      win?.close();
      alert(e.message);
    }
  };

  const download = (item) => run(async () => {
    const url = await getLink(item, false);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ─── Subidas ─── */
  const updateUpload = (id, patch) => setUploads(list => list.map(u => (u.id === id ? { ...u, ...patch } : u)));

  async function sendChunks(job, uploadId) {
    const { file } = job;
    let offset = 0;
    let attempts = 0;
    while (offset < file.size) {
      if (cancelled.current.has(job.id)) throw new Error('Cancelado');
      const end = Math.min(offset + CHUNK, file.size);
      try {
        const start = offset;
        await putChunk(
          uploadId, start, file.slice(start, end),
          (loaded) => updateUpload(job.id, { sent: start + loaded }),
          (xhr) => { xhrs.current[job.id] = xhr; },
        );
        offset = end;
        attempts = 0;
        updateUpload(job.id, { sent: offset });
      } catch (e) {
        if (e.message === 'Cancelado') throw e;
        if (e.status === 409 && typeof e.body?.received === 'number') { offset = e.body.received; continue; }
        if (e.status && e.status < 500) throw e;          // un 4xx no se arregla reintentando
        if (++attempts >= 3) throw e;
        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  }

  async function runQueue() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const job = queue.current.shift();
      if (cancelled.current.has(job.id)) continue;
      updateUpload(job.id, { status: 'uploading' });
      let uploadId;
      try {
        ({ uploadId } = await api('/admin/files/upload/init', {
          method: 'POST',
          body: JSON.stringify({ path: job.dir, name: job.file.name, size: job.file.size }),
        }));
        await sendChunks(job, uploadId);
        if (cancelled.current.has(job.id)) throw new Error('Cancelado');
        const r = await api(`/admin/files/upload/${uploadId}/complete`, { method: 'POST', body: '{}' });
        updateUpload(job.id, { status: 'done', sent: job.file.size, finalName: r.name });
      } catch (e) {
        if (uploadId) api(`/admin/files/upload/${uploadId}`, { method: 'DELETE' }).catch(() => {});
        updateUpload(job.id, { status: e.message === 'Cancelado' ? 'cancelled' : 'error', error: e.message });
      }
    }
    running.current = false;
    reload();
  }

  function addFiles(files) {
    if (!files.length) return;
    const jobs = files.map(file => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, dir: cwd }));
    setUploads(list => [...list, ...jobs.map(j => ({ id: j.id, name: j.file.name, size: j.file.size, sent: 0, status: 'queued' }))]);
    queue.current.push(...jobs);
    runQueue();
  }

  function cancelUpload(id) {
    cancelled.current.add(id);
    xhrs.current[id]?.abort();
    updateUpload(id, { status: 'cancelled' });
  }

  function onDrop(e) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = [];
    let skipped = 0;
    for (const item of e.dataTransfer.items) {
      if (item.kind !== 'file') continue;
      if (item.webkitGetAsEntry?.()?.isDirectory) { skipped++; continue; }
      const f = item.getAsFile();
      if (f) files.push(f);
    }
    if (skipped) alert('Arrastrar carpetas no está soportado. Crea la carpeta y sube los archivos dentro.');
    addFiles(files);
  }

  if (authLoading || !user?.isAdmin) return null;

  const selectedItems = rows.filter(r => selected.has(r.name));
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.name));
  const crumbs = cwd.split('/').filter(Boolean);
  const activeUploads = uploads.some(u => u.status === 'queued' || u.status === 'uploading');
  // La barra mide los archivos frente al espacio que pueden usar (lo libre menos la reserva del servidor),
  // no el disco entero: el sistema y los deploys ocupan el resto y no son "archivos".
  const available = usage ? Math.max(0, usage.disk.free - (usage.reserve || 0)) : 0;
  const usedPct = usage && usage.filesBytes ? usage.filesBytes / (usage.filesBytes + available) : 0;

  const sortHeader = (key, label, cls) => (
    <th className={cls} style={{ ...thStyle, cursor: 'pointer' }}
      onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div
      className="page-transition"
      style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 120px' }}
      onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <VideoBackground veil="strong" />
      <style>{CSS}</style>

      {/* Encabezado y espacio */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="px-badge" style={{ display: 'inline-block', marginBottom: 14 }}>Admin</span>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.035em', margin: 0, color: 'var(--px-white)' }}>Archivos</h1>
          <p style={{ ...muted, margin: '6px 0 0' }}>Almacenamiento del servidor</p>
        </div>
        {usage && (
          <div style={{ ...glass, padding: '12px 16px', minWidth: 260 }}>
            <div style={{ ...muted, fontSize: 12, marginBottom: 8 }}>
              {fmtBytes(usage.filesBytes)} usados · {fmtBytes(available)} disponibles
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--px-border)', overflow: 'hidden' }}>
              <div style={{
                width: `${usedPct ? Math.max(1, Math.min(100, usedPct * 100)) : 0}%`, height: '100%',
                background: usedPct > 0.85 ? RED : usedPct > 0.7 ? AMBER : GREEN,
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button style={btn('primary')} onClick={() => fileInput.current?.click()}>Subir archivos</button>
        <input ref={fileInput} type="file" multiple hidden
          onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
        <button style={btn()} onClick={newFolder}>Nueva carpeta</button>
        <button style={btn()} onClick={newFile}>Nuevo archivo</button>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar en esta carpeta..."
          aria-label="Buscar en esta carpeta"
          style={{ ...glass, flex: 1, minWidth: 160, padding: '9px 16px', fontSize: 13, borderRadius: 999, outline: 'none', color: 'var(--px-white)', fontFamily: 'inherit' }}
        />
        {selectedItems.length > 0 && (
          <>
            <span style={muted}>{selectedItems.length} seleccionado{selectedItems.length > 1 ? 's' : ''}</span>
            <button style={btn()} onClick={() => move(selectedItems)}>Mover</button>
            <button style={btn('danger')} onClick={() => remove(selectedItems)}>Eliminar</button>
          </>
        )}
      </div>

      {/* Ruta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
        <button style={{ ...linkBtn, fontSize: 13, color: crumbs.length ? 'var(--px-muted)' : 'var(--px-white)' }} onClick={() => goTo('')}>Archivos</button>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={muted}>/</span>
            <button style={{ ...linkBtn, fontSize: 13, color: i === crumbs.length - 1 ? 'var(--px-white)' : 'var(--px-muted)' }}
              onClick={() => goTo(crumbs.slice(0, i + 1).join('/'))}>{c}</button>
          </span>
        ))}
      </div>

      {/* Cola de subidas */}
      {uploads.length > 0 && (
        <div style={{ ...glass, padding: '12px 16px', marginBottom: 12, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--px-white)' }}>Subidas</strong>
            {!activeUploads && <button style={linkBtn} onClick={() => setUploads([])}>Limpiar</button>}
          </div>
          {uploads.map(u => {
            const pct = u.size ? Math.min(100, Math.round((u.sent / u.size) * 100)) : (u.status === 'done' ? 100 : 0);
            const color = u.status === 'error' ? RED : u.status === 'done' ? GREEN : 'var(--px-accent)';
            return (
              <div key={u.id} style={{ padding: '8px 0', borderTop: '1px solid var(--px-glass-border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.finalName || u.name}</span>
                  <span style={{ ...muted, fontSize: 11 }}>
                    {u.status === 'queued' ? 'En cola' : u.status === 'uploading' ? `${pct}%` : u.status === 'done' ? 'Listo' : u.status === 'cancelled' ? 'Cancelado' : 'Error'}
                  </span>
                  {(u.status === 'queued' || u.status === 'uploading') && <button style={linkBtn} aria-label="Cancelar subida" onClick={() => cancelUpload(u.id)}>✕</button>}
                </div>
                <div style={{ height: 4, borderRadius: 99, background: 'var(--px-border)', overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .2s ease' }} />
                </div>
                <div style={{ ...muted, fontSize: 11, marginTop: 4, color: u.status === 'error' ? RED : 'var(--px-muted)' }}>
                  {u.status === 'error' ? u.error : `${fmtBytes(u.sent)} de ${fmtBytes(u.size)}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Lista */}
      <div style={{ ...glass, overflow: 'hidden' }}>
        {error && <p style={{ color: RED, padding: 16, margin: 0 }}>{error}</p>}
        {!data && !error && <p style={{ ...muted, padding: 16, margin: 0 }}>Cargando...</p>}
        {data && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 36 }}>
                  <input type="checkbox" checked={allSelected} aria-label="Seleccionar todo"
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.name)))} />
                </th>
                {sortHeader('name', 'Nombre')}
                {sortHeader('size', 'Tamaño', 'files-col-size')}
                {sortHeader('modified', 'Modificado', 'files-col-date')}
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {rows.map(item => (
                <tr key={item.name}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(item.name)} aria-label={`Seleccionar ${item.name}`}
                      onChange={() => setSelected(s => { const n = new Set(s); if (n.has(item.name)) n.delete(item.name); else n.add(item.name); return n; })} />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => (item.type === 'dir' ? goTo(join(item.name)) : isEditable(item.name) ? setEditing(join(item.name)) : item.previewable ? openFile(item) : download(item))}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--px-white)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', wordBreak: 'break-all', fontFamily: 'inherit' }}
                    >
                      <Icon dir={item.type === 'dir'} />
                      <span style={{ fontWeight: item.type === 'dir' ? 700 : 400 }}>{item.name}</span>
                    </button>
                  </td>
                  <td className="files-col-size" style={{ ...tdStyle, color: 'var(--px-muted)' }}>{item.size == null ? '—' : fmtBytes(item.size)}</td>
                  <td className="files-col-date" style={{ ...tdStyle, color: 'var(--px-muted)' }}>{fmtDate(item.modified)}</td>
                  <td className="files-actions" style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {item.type === 'file' && isEditable(item.name) && <button style={linkBtn} onClick={() => setEditing(join(item.name))}>Editar</button>}
                    {item.type === 'file' && item.previewable && <button style={linkBtn} onClick={() => openFile(item)}>Abrir</button>}
                    {item.type === 'file' && <button style={linkBtn} onClick={() => download(item)}>Descargar</button>}
                    <button style={linkBtn} onClick={() => rename(item)}>Renombrar</button>
                    <button style={linkBtn} onClick={() => move([item])}>Mover</button>
                    <button style={{ ...linkBtn, color: RED }} onClick={() => remove([item])}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--px-muted)', padding: 40 }}>
                  {filter ? 'Sin resultados' : 'Carpeta vacía. Arrastra archivos aquí para subirlos.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {data?.truncated && <p style={{ ...muted, marginTop: 8 }}>Solo se muestran los primeros 5000 elementos de esta carpeta.</p>}

      {/* Zona de soltar */}
      {dragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ border: '2px dashed var(--px-accent)', borderRadius: 24, padding: '48px 64px', color: 'var(--px-white)', fontSize: 18, fontWeight: 700 }}>
            Suelta para subir a /{cwd}
          </div>
        </div>
      )}


      {editing && (
        <FileEditor path={editing} api={api} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />
      )}
    </div>
  );
}
