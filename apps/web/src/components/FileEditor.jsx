// FileEditor.jsx — Editor de archivos de texto del gestor de Archivos (solo admin)
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function langLabel(name) {
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  return ext || 'Texto';
}

const RED = '#ef4444';
const btn = (primary) => ({
  padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  border: `1px solid ${primary ? 'var(--px-accent)' : 'var(--px-glass-border)'}`,
  background: primary ? 'var(--px-accent)' : 'var(--px-glass-hover)',
  color: primary ? 'var(--px-accent-fg)' : 'var(--px-white)',
});
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LINE_H = 20;

const CSS = `
  .fe-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .fe-panel { width: min(1100px, 100%); height: min(820px, 100%); display: flex; flex-direction: column; border-radius: 20px; overflow: hidden; }
  .fe-area { flex: 1; min-height: 0; display: flex; background: var(--px-bg); border-top: 1px solid var(--px-glass-border); border-bottom: 1px solid var(--px-glass-border); }
  .fe-gutter { overflow: hidden; padding: 12px 10px 40px 14px; text-align: right; color: var(--px-muted); opacity: .6; user-select: none; white-space: pre; border-right: 1px solid var(--px-glass-border); }
  .fe-text { flex: 1; min-width: 0; resize: none; border: none; outline: none; background: transparent; color: var(--px-white); padding: 12px 14px; tab-size: 2; caret-color: var(--px-accent); }
  .fe-text:focus-visible { outline: none; box-shadow: none; }  /* el panel entero ya es el foco: el anillo global estorba */
  @media (max-width: 720px) {
    .fe-overlay { padding: 0; }
    .fe-panel { width: 100%; height: 100%; border-radius: 0; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
    .fe-hide-sm { display: none; }
  }
`;

/**
 * Props: path (ruta relativa del archivo), api (helper JSON del gestor), onClose(saved:boolean)
 */
export default function FileEditor({ path, api, onClose }) {
  const name = path.split('/').pop();
  const [state, setState] = useState({ loading: true, error: '' });
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [modified, setModified] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [didSave, setDidSave] = useState(false);
  const area = useRef(null);
  const gutter = useRef(null);

  const dirty = !state.loading && !state.error && text !== saved;

  useEffect(() => {
    let alive = true;
    api(`/admin/files/content?path=${encodeURIComponent(path)}`)
      .then((d) => {
        if (!alive) return;
        setText(d.content); setSaved(d.content); setModified(d.modified);
        setState({ loading: false, error: '' });
        requestAnimationFrame(() => area.current?.focus());
      })
      .catch((e) => { if (alive) setState({ loading: false, error: e.message }); });
    return () => { alive = false; };
  }, [path, api]);

  // Avisar si se cierra la pestaña con cambios sin guardar
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return;
    onClose(didSave);
  };

  async function save(force = false) {
    if (saving) return;
    setSaving(true);
    setNotice('');
    const content = text;
    try {
      const qs = `path=${encodeURIComponent(path)}${!force && modified ? `&expected=${encodeURIComponent(modified)}` : ''}`;
      const res = await fetch(`/api/admin/files/content?${qs}`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: content,
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.conflict) {
        setSaving(false);
        if (confirm('El archivo cambió en el servidor desde que lo abriste. ¿Sobrescribirlo con tu versión?')) return save(true);
        return;
      }
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setSaved(content);
      setModified(d.modified);
      setDidSave(true);
      setNotice('Guardado');
      setTimeout(() => setNotice(n => (n === 'Guardado' ? '' : n)), 2000);
    } catch (e) {
      setNotice(e.message);
    }
    setSaving(false);
  }

  // Inserta texto donde está el cursor conservando el deshacer del navegador
  function insert(str) {
    const el = area.current;
    if (!document.execCommand?.('insertText', false, str)) {
      el.setRangeText(str, el.selectionStart, el.selectionEnd, 'end');
      setText(el.value);
    }
  }

  function onKeyDown(e) {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value } = el;
      if (e.shiftKey) {
        // Quitar hasta 2 espacios al inicio de la línea actual
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        const strip = value.slice(lineStart, lineStart + 2).match(/^ {1,2}/)?.[0].length || 0;
        if (strip) {
          el.setSelectionRange(lineStart, lineStart + strip);
          insert('');
          el.setSelectionRange(Math.max(lineStart, s - strip), Math.max(lineStart, end - strip));
        }
      } else {
        insert('  ');
      }
      return;
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.isComposing) {
      // Mantener la sangría de la línea anterior
      const { selectionStart: s, value } = el;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const indent = value.slice(lineStart, s).match(/^[ \t]*/)[0];
      if (indent) { e.preventDefault(); insert('\n' + indent); }
    }
  }

  function trackCursor() {
    const el = area.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, col: el.selectionStart - before.lastIndexOf('\n') });
  }

  const lineCount = text.split('\n').length;
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  const bytes = new Blob([text]).size;

  return createPortal(
    <div className="fe-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <style>{CSS}</style>
      <div className="fe-panel glass-menu" role="dialog" aria-modal="true" aria-label={`Editar ${name}`}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--px-white)', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              {dirty && <span title="Cambios sin guardar" style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--px-accent)', flexShrink: 0 }} />}
            </div>
            <div className="fe-hide-sm" style={{ fontSize: 12, color: 'var(--px-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{path}</div>
          </div>
          {notice && <span style={{ fontSize: 12, color: notice === 'Guardado' ? '#10b981' : RED }}>{notice}</span>}
          <button style={btn(false)} className="fe-hide-sm" onClick={() => setWrap(w => !w)} aria-pressed={wrap}>
            {wrap ? 'Sin ajuste' : 'Ajustar líneas'}
          </button>
          <button style={{ ...btn(true), opacity: dirty && !saving ? 1 : 0.5 }} disabled={!dirty || saving} onClick={() => save()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button style={btn(false)} onClick={close} aria-label="Cerrar editor">✕</button>
        </div>

        {/* Texto */}
        <div className="fe-area">
          {state.loading && <p style={{ color: 'var(--px-muted)', padding: 16, margin: 0, fontSize: 13 }}>Cargando...</p>}
          {state.error && <p style={{ color: RED, padding: 16, margin: 0, fontSize: 13 }}>{state.error}</p>}
          {!state.loading && !state.error && (
            <>
              {!wrap && (
                <div ref={gutter} className="fe-gutter" aria-hidden="true" style={{ fontFamily: MONO, fontSize: 13, lineHeight: `${LINE_H}px` }}>
                  {numbers}
                </div>
              )}
              <textarea
                ref={area}
                className="fe-text"
                value={text}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap={wrap ? 'soft' : 'off'}
                aria-label={`Contenido de ${name}`}
                style={{ fontFamily: MONO, fontSize: 13, lineHeight: `${LINE_H}px`, whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowX: wrap ? 'hidden' : 'auto' }}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                onKeyUp={trackCursor}
                onClick={trackCursor}
                onSelect={trackCursor}
                onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
              />
            </>
          )}
        </div>

        {/* Pie */}
        <div style={{ display: 'flex', gap: 16, padding: '8px 16px', fontSize: 12, color: 'var(--px-muted)', flexWrap: 'wrap' }}>
          <span>Línea {cursor.line}, columna {cursor.col}</span>
          <span>{lineCount} líneas</span>
          <span>{bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}</span>
          <span style={{ marginLeft: 'auto' }}>{langLabel(name)} · UTF-8</span>
          <span className="fe-hide-sm">⌘/Ctrl+S para guardar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
