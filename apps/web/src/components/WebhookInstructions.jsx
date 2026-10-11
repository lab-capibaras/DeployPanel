// WebhookInstructions.jsx
// Instrucciones para configurar el webhook de GitHub de un deploy, con su secreto.
// Props:
//   subdomain: string — el subdominio del deploy (ej: "mi-app")
//   repoUrl: string — la URL del repo (ej: "https://github.com/user/repo")
//   onClose: function — callback para cerrar el modal
//   title?: string — título alternativo (por defecto "Deploy exitoso")
//
// Se monta en <body> vía portal: dentro de .page-transition (z-index:1) el navbar
// (z-50) quedaría por encima del overlay.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';

const mono = "'JetBrains Mono',monospace";

function CopyRow({ value, label, w }) {
    const [copied, setCopied] = useState(false);
    function copy() {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--px-muted)' }}>{label}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{
                    flex: 1, minWidth: 0, padding: '10px 14px',
                    background: 'var(--px-glass-hover)', border: '1px solid var(--px-glass-border)', borderRadius: 12,
                    color: 'var(--px-white)', fontFamily: mono, fontSize: 13,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {value}
                </code>
                <button
                    onClick={copy}
                    style={{
                        padding: '10px 16px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
                        background: copied ? 'rgba(16,185,129,0.12)' : 'var(--px-glass-hover)',
                        border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'var(--px-glass-border)'}`,
                        color: copied ? '#10b981' : 'var(--px-white)',
                        fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    }}
                >
                    {copied ? w.copied : w.copy}
                </button>
            </div>
        </div>
    );
}

export default function WebhookInstructions({ subdomain, repoUrl, onClose, title }) {
    const w = useTranslation().webhook;
    // undefined = cargando · null = error · objeto = { url, secret, contentType }
    const [hook, setHook] = useState(undefined);

    useEffect(() => {
        let alive = true;
        fetch(`/api/deploys/${encodeURIComponent(subdomain)}/webhook`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (alive) setHook(d); })
            .catch(() => { if (alive) setHook(null); });
        return () => { alive = false; };
    }, [subdomain]);

    async function rotateSecret() {
        if (!confirm(w.rotate_confirm)) return;
        const r = await fetch(`/api/deploys/${encodeURIComponent(subdomain)}/webhook/rotate`, {
            method: 'POST',
            credentials: 'include',
        });
        if (r.ok) {
            const d = await r.json();
            setHook(h => ({ ...h, secret: d.secret }));
        }
    }

    const webhookUrl = hook?.url || 'https://stardest.com/webhook';
    const siteUrl = `https://${subdomain}.stardest.com`;
    const repoSettingsUrl = repoUrl ? repoUrl.replace(/\.git$/, '').replace(/\/+$/, '') + '/settings/hooks/new' : null;

    return createPortal(
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }}>
            <div
                className="glass-menu"
                role="dialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 540, padding: 32, borderRadius: 24, maxHeight: '90vh', overflowY: 'auto' }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ fontWeight: 800, fontSize: 24, color: 'var(--px-white)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                            {title || w.title}
                        </h2>
                        <a href={siteUrl} target="_blank" rel="noreferrer"
                            style={{ fontFamily: mono, fontSize: 14, color: 'var(--px-accent)', textDecoration: 'none' }}>
                            {siteUrl}
                        </a>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={w.close}
                        style={{ background: 'none', border: 'none', color: 'var(--px-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ border: '1px solid var(--px-glass-border)', borderRadius: 16, background: 'var(--px-glass-hover)', padding: 20, marginBottom: 20 }}>
                    <p style={{ fontSize: 14, color: 'var(--px-muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
                        {w.description}
                    </p>

                    {w.steps.map((text, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                            <span style={{ fontFamily: mono, fontSize: 13, color: 'var(--px-accent)', minWidth: 20, fontWeight: 700 }}>{i + 1}.</span>
                            <span style={{ fontSize: 14, color: 'var(--px-muted)', lineHeight: 1.5 }}>{text}</span>
                        </div>
                    ))}

                    <CopyRow value={webhookUrl} label={w.url_label} w={w} />

                    {hook === undefined && <p style={{ fontSize: 13, color: 'var(--px-muted)', margin: '14px 0 0' }}>{w.secret_loading}</p>}
                    {hook === null && <p style={{ fontSize: 13, color: 'var(--px-red)', margin: '14px 0 0' }}>{w.secret_error}</p>}
                    {hook?.secret && (
                        <>
                            <CopyRow value={hook.secret} label={w.secret_label} w={w} />
                            <button onClick={rotateSecret}
                                style={{ marginTop: 10, fontSize: 12, background: 'none', border: 'none', color: 'var(--px-muted)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' }}>
                                {w.rotate}
                            </button>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {repoSettingsUrl && (
                        <a href={repoSettingsUrl} target="_blank" rel="noreferrer" className="px-btn"
                            style={{ flex: '1 1 200px', textDecoration: 'none', textAlign: 'center', fontSize: 14 }}>
                            {w.goto_settings}
                        </a>
                    )}
                    <button onClick={onClose} className="px-btn-ghost" style={{ flex: '1 1 120px', fontSize: 14 }}>
                        {w.close}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
