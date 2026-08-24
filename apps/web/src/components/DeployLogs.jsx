// DeployLogs.jsx
// Muestra los logs en tiempo real de un deploy en curso (Server-Sent Events)
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';

const TYPE_COLOR = {
  info:    'var(--px-white)',
  build:   'var(--px-muted)',
  success: '#10b981',
  error:   '#ef4444',
  fail:    '#ef4444',
};

export default function DeployLogs({ subdomain, onDone, onFail }) {
  const t = useTranslation();
  const p = t.deploy.progress;
  const [lines, setLines]   = useState([]);
  const [status, setStatus] = useState('running'); // running | done | fail
  const bottomRef           = useRef(null);

  useEffect(() => {
    if (!subdomain) return;

    setLines([]);
    setStatus('running');

    const es = new EventSource(`/api/deploy-logs/${subdomain}`, { withCredentials: true });

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === 'done') {
          setStatus('done');
          setLines(prev => [...prev, { type: 'success', message: `✓ ${data.url}` }]);
          es.close();
          onDone?.(data.url);
          return;
        }

        if (data.type === 'fail') {
          setStatus('fail');
          setLines(prev => [...prev, { type: 'error', message: `✗ ${data.message}` }]);
          es.close();
          onFail?.(data.message);
          return;
        }

        setLines(prev => [...prev, data]);
      } catch {
        // línea de log mal formada — se ignora
      }
    };

    es.onerror = () => {
      // El servidor cierra la conexión al terminar el deploy — es normal
      es.close();
    };

    return () => { es.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain]);

  // Auto-scroll al fondo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div style={{
      borderRadius: 'var(--px-radius)',
      border: '1px solid var(--px-border)',
      background: 'var(--px-bg2)',
      overflow: 'hidden',
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Barra superior estilo terminal */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        borderBottom: '1px solid var(--px-border)',
        background: 'var(--px-bg)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: status === 'fail' ? '#ef4444' : '#fbbf24' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: status === 'done' ? '#10b981' : 'var(--px-border-glow)' }} />
        <span style={{ fontSize: 11, color: 'var(--px-muted)', marginLeft: 4 }}>
          {subdomain}.stardest.com — {p.log_label}
        </span>
        {status === 'running' && (
          <span style={{
            marginLeft: 'auto', fontSize: 11,
            color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#fbbf24',
              animation: 'px-deploy-log-pulse 1s ease-in-out infinite',
              display: 'inline-block',
            }} />
            {p.running}
          </span>
        )}
        {status === 'done' && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#10b981' }}>✓ {p.completed}</span>
        )}
        {status === 'fail' && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ef4444' }}>✗ {p.failed}</span>
        )}
      </div>

      {/* Área de logs */}
      <div style={{
        height: 260,
        overflowY: 'auto',
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {lines.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--px-muted)', opacity: 0.6 }}>
            {p.waiting}
          </span>
        )}
        {lines.map((line, i) => (
          <div key={i} style={{
            fontSize: 12,
            lineHeight: 1.7,
            color: TYPE_COLOR[line.type] || 'var(--px-white)',
            opacity: line.type === 'build' ? 0.7 : 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {line.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes px-deploy-log-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
