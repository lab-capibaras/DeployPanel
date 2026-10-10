// Console.jsx — StarDest Console (solo admin)
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/* ─── API ─── */
// La sesión de StarDest va en la cookie httpOnly auth_token (credentials: 'include');
// la sesión de consola (TOTP) va aparte en el header X-Admin-Token.
class TotpRequired extends Error {}

async function adminFetch(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': sessionStorage.getItem('admin_token') || '',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.code === 'TOTP_REQUIRED') {
    sessionStorage.removeItem('admin_token');
    throw new TotpRequired();
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function adminAction(path, options, onLocked) {
  try {
    return await adminFetch(path, options);
  } catch (e) {
    if (e instanceof TotpRequired) onLocked();
    else alert(e.message);
    return null;
  }
}

function useAdminData(path, onLocked, intervalMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = () => adminFetch(path)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError('');
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof TotpRequired) onLocked();
        else setError(e.message);
      });
    run();
    const t = intervalMs ? setInterval(run, intervalMs) : null;
    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [path, onLocked, intervalMs, reloadKey]);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);
  return { data, error, reload };
}

/* ─── Formato ─── */
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
function fmtDuration(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function fmtAgo(v) {
  if (!v) return '—';
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
function repoShort(url) {
  const m = String(url || '').match(/github\.com\/(.+?)(?:\.git)?\/?$/);
  return m ? m[1] : url;
}

/* ─── UI base ─── */
const GREEN = '#10b981', RED = '#ef4444', AMBER = '#f59e0b', BLUE = '#60a5fa';
const mono = "'JetBrains Mono', monospace";

const card = {
  background: 'var(--px-glass-bg)', border: '1px solid var(--px-glass-border)',
  borderRadius: 14, padding: 20, boxShadow: 'var(--px-glass-shadow)',
};
const muted = { color: 'var(--px-muted)', fontSize: 13 };
const title = { fontWeight: 700, color: 'var(--px-white)', marginBottom: 12 };
const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 });
const btn = (variant = 'default') => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${variant === 'danger' ? 'rgba(239,68,68,0.4)' : 'var(--px-border)'}`,
  background: variant === 'primary' ? 'var(--px-white)' : variant === 'danger' ? 'rgba(239,68,68,0.08)' : 'transparent',
  color: variant === 'primary' ? 'var(--px-bg)' : variant === 'danger' ? RED : 'var(--px-white)',
});

const STATUS_COLOR = {
  running: GREEN, ok: GREEN, success: GREEN,
  restarting: RED, down: RED, missing: RED, error: RED,
  degraded: AMBER, start: AMBER, webhook: BLUE,
  exited: '#a1a1aa', created: '#a1a1aa', unknown: '#a1a1aa',
};
function Badge({ value }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: STATUS_COLOR[value] || 'var(--px-muted)' }}>
      ● {value}
    </span>
  );
}

function Meter({ label, used, total, bytes = true, sub }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 85 ? RED : pct > 70 ? AMBER : GREEN;
  return (
    <div style={card}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 10px', color: 'var(--px-white)' }}>{pct.toFixed(0)}%</div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--px-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
      </div>
      <div style={{ ...muted, marginTop: 8, fontSize: 12 }}>
        {bytes ? `${fmtBytes(used)} / ${fmtBytes(total)}` : sub}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: 'var(--px-white)' }}>{value}</div>
      {sub && <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─── Pantalla de código TOTP ─── */
function TotpGate({ onUnlock }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(value) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/totp/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Código inválido');
      sessionStorage.setItem('admin_token', data.adminToken);
      onUnlock();
    } catch (e) {
      setError(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...card, width: '100%', maxWidth: 380, padding: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', color: 'var(--px-white)' }}>Console</h1>
        <p style={{ ...muted, margin: '0 0 24px' }}>Ingresa el código de Google Authenticator</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Código de 6 dígitos"
          value={code}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          placeholder="000000"
          style={{
            width: '100%', boxSizing: 'border-box', textAlign: 'center',
            fontFamily: mono, fontSize: 28, letterSpacing: '0.4em',
            padding: '14px 12px', borderRadius: 10, outline: 'none',
            border: '1px solid var(--px-border)', background: 'var(--px-bg)', color: 'var(--px-white)',
          }}
        />
        {error && <p style={{ color: RED, fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
        {busy && <p style={{ ...muted, margin: '14px 0 0' }}>Verificando...</p>}
      </div>
    </div>
  );
}

/* ─── Modal de logs ─── */
// Se monta en <body> vía portal: .page-transition forma un stacking context
// con z-index:1, y dentro de él el modal quedaría debajo del navbar (z-50).
function LogsModal({ name, onClose, onLocked }) {
  const { data, error, reload } = useAdminData(`/containers/${name}/logs?tail=300`, onLocked);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [data]);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, background: 'var(--px-surface)', width: '100%', maxWidth: 1000, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--px-border)' }}>
          <span style={{ fontFamily: mono, fontSize: 13, color: 'var(--px-white)', flex: 1 }}>{name}</span>
          <button style={btn()} onClick={reload}>Actualizar</button>
          <button style={btn()} onClick={onClose}>Cerrar</button>
        </div>
        <pre ref={ref} style={{ margin: 0, padding: 16, height: '60vh', overflow: 'auto', fontSize: 12, lineHeight: 1.6, fontFamily: mono, color: 'var(--px-white)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error ? `Error: ${error}` : data ? (data.logs || '(sin logs)') : 'Cargando...'}
        </pre>
      </div>
    </div>,
    document.body
  );
}

/* ─── Monitoreo ─── */
function OverviewTab({ onLocked }) {
  const { data, error } = useAdminData('/overview', onLocked, 10000);
  const { data: res } = useAdminData('/resources', onLocked, 30000);
  if (error) return <p style={{ color: RED }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;
  const { host, docker, platform } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {platform.paused && (
        <div style={{ ...card, borderColor: 'rgba(245,158,11,0.4)', color: AMBER, fontSize: 14 }}>
          Los deploys nuevos están en pausa (modo mantenimiento).
        </div>
      )}

      <div style={grid(220)}>
        <Meter label="CPU" used={host.cpuPercent} total={100} bytes={false}
          sub={`${host.cores} núcleos · load ${host.load.map(l => l.toFixed(2)).join(' / ')}`} />
        <Meter label="RAM" used={host.memory.used} total={host.memory.total} />
        <Meter label="Swap" used={host.swap.used} total={host.swap.total} />
        {host.disk && <Meter label="Disco" used={host.disk.used} total={host.disk.total} />}
      </div>

      <div style={grid(170)}>
        <Stat label="Deploys" value={platform.deploys} sub={`${platform.running}/${platform.containers} contenedores arriba`} />
        <Stat label="Usuarios con deploys" value={platform.users} />
        <Stat label="Bases de datos" value={platform.databases} />
        <Stat label="Docker" value={`${docker.running}/${docker.containers}`} sub={`${docker.images} imágenes · v${docker.version}`} />
        <Stat label="Uptime del servidor" value={fmtDuration(host.uptime)} />
      </div>

      {platform.restarting.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ color: RED, fontWeight: 700, marginBottom: 8 }}>Contenedores en reinicio continuo</div>
          {platform.restarting.map(n => (
            <div key={n} style={{ fontFamily: mono, fontSize: 13, color: 'var(--px-white)' }}>{n}</div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={title}>Consumo por contenedor</div>
        {!res ? <p style={muted}>Cargando...</p> : res.containers.length === 0 ? <p style={muted}>No hay contenedores de usuarios corriendo.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {res.containers.slice(0, 15).map(c => (
              <div key={c.name} style={{ display: 'flex', gap: 12, fontSize: 13, fontFamily: mono }}>
                <span style={{ flex: 1, color: 'var(--px-white)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--px-muted)' }}>{c.memory == null ? '—' : fmtBytes(c.memory)}</span>
                <span style={{ width: 70, textAlign: 'right', color: 'var(--px-muted)' }}>{c.cpuPercent == null ? '—' : `${c.cpuPercent}%`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Deploys ─── */
function DeploysTab({ onLocked }) {
  const { data, error, reload } = useAdminData('/deploys', onLocked, 15000);
  const [filter, setFilter] = useState('');
  const [logsFor, setLogsFor] = useState(null);

  if (error) return <p style={{ color: RED }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  const q = filter.trim().toLowerCase();
  const deploys = data.deploys.filter(d => !q || [d.subdomain, d.repo, d.userEmail, d.userId]
    .some(v => String(v).toLowerCase().includes(q)));

  async function containerAction(name, action) {
    if (action === 'stop' && !confirm(`¿Detener ${name}?`)) return;
    await adminAction(`/containers/${name}/${action}`, { method: 'POST' }, onLocked);
    reload();
  }

  async function removeDeploy(sub) {
    const typed = prompt(`Esto elimina "${sub}" con su base de datos. Escribe el subdominio para confirmar:`);
    if (typed !== sub) return;
    await adminAction(`/deploys/${sub}`, { method: 'DELETE' }, onLocked);
    reload();
  }

  const owner = (d) => (d.userEmail && !['anonymous', 'unknown'].includes(d.userEmail)) ? d.userEmail : d.userId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar por subdominio, repo o usuario..."
        aria-label="Buscar deploys"
        style={{ padding: '10px 14px', fontSize: 14, borderRadius: 10, outline: 'none', border: '1px solid var(--px-border)', background: 'var(--px-surface)', color: 'var(--px-white)' }}
      />
      <div style={muted}>{deploys.length} de {data.deploys.length} deploys</div>

      {deploys.map(d => (
        <div key={d.subdomain} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <a href={`https://${d.subdomain}.stardest.com`} target="_blank" rel="noreferrer"
              style={{ fontSize: 16, fontWeight: 800, color: 'var(--px-white)', textDecoration: 'none' }}>
              {d.subdomain}
            </a>
            <Badge value={d.health} />
            {d.database && <span style={{ ...muted, fontSize: 12 }}>{d.database.type}</span>}
            <span style={{ flex: 1 }} />
            <button style={btn('danger')} onClick={() => removeDeploy(d.subdomain)}>Eliminar</button>
          </div>
          <div style={{ ...muted, fontSize: 12, marginBottom: 12 }}>
            {owner(d)} · {repoShort(d.repo)} · {d.branch} · {fmtAgo(d.deployedAt)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.containers.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--px-bg)' }}>
                <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--px-white)', minWidth: 220 }}>{c.name}</span>
                <Badge value={c.state} />
                <span style={{ ...muted, fontSize: 12, flex: 1 }}>{c.status}</span>
                <button style={btn()} onClick={() => setLogsFor(c.name)}>Logs</button>
                <button style={btn()} onClick={() => containerAction(c.name, 'restart')}>Reiniciar</button>
                {c.state === 'running' || c.state === 'restarting'
                  ? <button style={btn()} onClick={() => containerAction(c.name, 'stop')}>Detener</button>
                  : <button style={btn()} onClick={() => containerAction(c.name, 'start')}>Iniciar</button>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.orphans.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(245,158,11,0.4)' }}>
          <div style={{ color: AMBER, fontWeight: 700, marginBottom: 4 }}>Bases de datos huérfanas</div>
          <div style={{ ...muted, fontSize: 12, marginBottom: 10 }}>Existen sin una app asociada. Probablemente quedaron de deploys fallidos.</div>
          {data.orphans.map(o => (
            <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--px-white)', flex: 1 }}>{o.name}</span>
              <Badge value={o.state} />
              <button style={btn()} onClick={() => setLogsFor(o.name)}>Logs</button>
              <button style={btn('danger')} onClick={() => removeDeploy(o.subdomain)}>Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {logsFor && <LogsModal name={logsFor} onClose={() => setLogsFor(null)} onLocked={onLocked} />}
    </div>
  );
}

/* ─── Actividad ─── */
function ActivityTab({ onLocked }) {
  const { data, error } = useAdminData('/activity', onLocked, 10000);
  if (error) return <p style={{ color: RED }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={card}>
        <div style={title}>Deploys recientes</div>
        {data.deployEvents.length === 0 && <p style={muted}>Sin eventos desde el último reinicio del panel.</p>}
        {data.deployEvents.map((e, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--px-border)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...muted, fontSize: 12, width: 90 }}>{fmtAgo(e.ts)}</span>
              <Badge value={e.type} />
              <span style={{ fontWeight: 700, color: 'var(--px-white)', fontSize: 14 }}>{e.subdomain}</span>
              <span style={{ ...muted, fontSize: 12 }}>
                {e.userEmail || e.userId || ''} {e.repoUrl ? `· ${repoShort(e.repoUrl)}` : ''} {e.source ? `· ${e.source}` : ''}
              </span>
            </div>
            {e.error && (
              <div style={{ fontFamily: mono, fontSize: 12, color: RED, marginTop: 4, wordBreak: 'break-all' }}>{e.error}</div>
            )}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={title}>Acciones del administrador</div>
        {data.audit.length === 0 && <p style={muted}>Sin acciones registradas.</p>}
        {data.audit.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '6px 0', flexWrap: 'wrap' }}>
            <span style={{ ...muted, fontSize: 12, width: 90 }}>{fmtAgo(a.ts)}</span>
            <span style={{ fontFamily: mono, color: 'var(--px-white)' }}>{a.action}</span>
            <span style={muted}>{a.target}</span>
            <span style={{ ...muted, marginLeft: 'auto' }}>{a.ip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mantenimiento ─── */
const SYSTEM_LOGS = [
  { key: 'deploy_panel', label: 'deploy_panel' },
  { key: 'traefik', label: 'traefik' },
  { key: 'static_server', label: 'static_server' },
  { key: 'cloudflared', label: 'cloudflared' },
  { key: 'frontend', label: 'frontend' },
];

function MaintenanceTab({ onLocked }) {
  const { data, error, reload } = useAdminData('/health', onLocked, 20000);
  const [logsFor, setLogsFor] = useState(null);
  const [pruneResult, setPruneResult] = useState('');

  if (error) return <p style={{ color: RED }}>{error}</p>;
  if (!data) return <p style={muted}>Cargando...</p>;

  async function togglePause() {
    await adminAction('/maintenance', { method: 'POST', body: JSON.stringify({ paused: !data.paused }) }, onLocked);
    reload();
  }

  async function prune() {
    if (!confirm('¿Eliminar imágenes Docker huérfanas (sin tag)?')) return;
    const r = await adminAction('/prune', { method: 'POST' }, onLocked);
    if (r) setPruneResult(`${r.deleted} imágenes eliminadas · ${fmtBytes(r.reclaimed)} liberados`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={card}>
        <div style={title}>Salud de servicios</div>
        {data.checks.map(c => (
          <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--px-border)', fontSize: 14 }}>
            <span style={{ color: 'var(--px-white)' }}>{c.name}</span>
            <Badge value={c.status} />
          </div>
        ))}
      </div>

      <div style={grid(280)}>
        <div style={card}>
          <div style={{ ...title, marginBottom: 6 }}>Pausar deploys</div>
          <p style={{ ...muted, marginTop: 0 }}>Los usuarios no podrán desplegar ni se procesarán webhooks. Tú sí puedes desplegar.</p>
          <button style={btn(data.paused ? 'primary' : 'danger')} onClick={togglePause}>
            {data.paused ? 'Reanudar deploys' : 'Pausar deploys'}
          </button>
        </div>
        <div style={card}>
          <div style={{ ...title, marginBottom: 6 }}>Limpiar Docker</div>
          <p style={{ ...muted, marginTop: 0 }}>Elimina imágenes sin tag (dangling).</p>
          <button style={btn()} onClick={prune}>Limpiar ahora</button>
          {pruneResult && <p style={{ ...muted, color: GREEN, marginBottom: 0 }}>{pruneResult}</p>}
        </div>
      </div>

      <div style={card}>
        <div style={title}>Logs del sistema</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SYSTEM_LOGS.map(s => (
            <button key={s.key} style={btn()} onClick={() => setLogsFor(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      {logsFor && <LogsModal name={logsFor} onClose={() => setLogsFor(null)} onLocked={onLocked} />}
    </div>
  );
}

/* ─── Página ─── */
const TABS = [
  { id: 'overview', label: 'Monitoreo' },
  { id: 'deploys', label: 'Deploys' },
  { id: 'activity', label: 'Actividad' },
  { id: 'maintenance', label: 'Mantenimiento' },
];

export default function Console() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(() => !!sessionStorage.getItem('admin_token'));
  const [tab, setTab] = useState('overview');
  const onLocked = useCallback(() => setUnlocked(false), []);

  useEffect(() => {
    if (!loading && !user?.isAdmin) navigate('/');
  }, [user, loading, navigate]);

  if (loading || !user?.isAdmin) return null;
  if (!unlocked) return <TotpGate onUnlock={() => setUnlocked(true)} />;

  function lock() {
    sessionStorage.removeItem('admin_token');
    setUnlocked(false);
  }

  return (
    <div className="page-transition" style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="swiss-index" style={{ display: 'block', marginBottom: 4 }}>Admin</span>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: 'var(--px-white)' }}>Console</h1>
          <p style={{ ...muted, margin: '6px 0 0' }}>Administración de StarDest</p>
        </div>
        <button style={btn()} onClick={lock}>Bloquear</button>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, marginBottom: 24, width: 'fit-content', maxWidth: '100%', overflowX: 'auto', background: 'var(--px-surface)', border: '1px solid var(--px-border)' }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: tab === t.id ? 'var(--px-bg)' : 'transparent',
            color: tab === t.id ? 'var(--px-white)' : 'var(--px-muted)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab onLocked={onLocked} />}
      {tab === 'deploys' && <DeploysTab onLocked={onLocked} />}
      {tab === 'activity' && <ActivityTab onLocked={onLocked} />}
      {tab === 'maintenance' && <MaintenanceTab onLocked={onLocked} />}
    </div>
  );
}
