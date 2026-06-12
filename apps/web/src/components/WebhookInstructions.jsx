// WebhookInstructions.jsx
// Muestra las instrucciones para configurar el webhook de GitHub
// Props:
//   subdomain: string — el subdominio del deploy (ej: "mi-app")
//   repoUrl: string — la URL del repo (ej: "https://github.com/user/repo")
//   onClose: function — callback para cerrar el modal

import { useState } from 'react';
import { useTranslation } from '../i18n';

export default function WebhookInstructions({ subdomain, repoUrl, onClose }) {
    const t = useTranslation();
    const w = t.webhook;
    const [copied, setCopied] = useState(false);

    const webhookUrl = 'https://stardest.com/webhook';
    const siteUrl = `https://${subdomain}.stardest.com`;

    // Construir URL de settings del repo
    const repoSettingsUrl = repoUrl
        ? repoUrl.replace(/\.git$/, '') + '/settings/hooks/new'
        : null;

    function copyWebhookUrl() {
        navigator.clipboard.writeText(webhookUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const copyBtnBg = copied ? 'rgba(16,185,129,0.12)' : 'var(--px-bg)';
    const copyBtnBorder = copied ? 'rgba(16,185,129,0.4)' : 'var(--px-border)';
    const copyBtnText = copied ? '#10b981' : 'var(--px-white)';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
        }}>
            <div className="px-card" style={{
                width: '100%', maxWidth: '520px',
                padding: '32px',
                position: 'relative',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{
                            fontFamily: "'Inter',sans-serif",
                            fontWeight: 800,
                            fontSize: '22px', color: 'var(--px-white)',
                            margin: '0 0 6px',
                        }}>
                            {w.title}
                        </h2>
                        <a
                            href={siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: '14px', color: 'var(--px-muted)',
                                textDecoration: 'none',
                                borderBottom: '1px dashed var(--px-border-glow)',
                            }}
                            onMouseEnter={e => e.target.style.color = 'var(--px-white)'}
                            onMouseLeave={e => e.target.style.color = 'var(--px-muted)'}
                        >
                            {siteUrl}
                        </a>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none',
                            color: 'var(--px-muted)', cursor: 'pointer',
                            fontSize: '22px', lineHeight: 1, padding: '4px',
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.target.style.color = 'var(--px-white)'}
                        onMouseLeave={e => e.target.style.color = 'var(--px-muted)'}
                    >
                        ✕
                    </button>
                </div>

                {/* Instrucciones webhook */}
                <div style={{
                    border: '1px solid var(--px-border)',
                    borderRadius: 10,
                    background: 'var(--px-bg)',
                    padding: '20px',
                    marginBottom: '20px',
                }}>
                    <p style={{
                        fontFamily: "'Inter',sans-serif",
                        fontSize: '14px', color: 'var(--px-muted)',
                        margin: '0 0 16px',
                        lineHeight: 1.6,
                    }}>
                        {w.description}
                    </p>

                    {/* Pasos */}
                    {w.steps.map((text, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                            marginBottom: '8px',
                        }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: '13px', color: 'var(--px-white)',
                                minWidth: '20px',
                                fontWeight: 700,
                            }}>
                                {i + 1}.
                            </span>
                            <span style={{
                                fontFamily: "'Inter',sans-serif",
                                fontSize: '14px', color: 'var(--px-muted)',
                                lineHeight: 1.5,
                            }}>
                                {text}
                            </span>
                        </div>
                    ))}

                    {/* URL copiable */}
                    <div style={{
                        display: 'flex', gap: '8px', marginTop: '16px',
                        alignItems: 'center',
                    }}>
                        <code style={{
                            flex: 1, padding: '10px 12px',
                            background: 'var(--px-surface)',
                            border: '1px solid var(--px-border)',
                            borderRadius: 8,
                            color: 'var(--px-white)',
                            fontFamily: "'JetBrains Mono',monospace", fontSize: '13px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {webhookUrl}
                        </code>
                        <button
                            onClick={copyWebhookUrl}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 8,
                                background: copyBtnBg,
                                border: `1px solid ${copyBtnBorder}`,
                                color: copyBtnText,
                                fontFamily: "'Inter',sans-serif",
                                fontSize: '14px', cursor: 'pointer',
                                transition: 'opacity 0.15s ease', whiteSpace: 'nowrap',
                                fontWeight: 600,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {copied ? w.copied : w.copy}
                        </button>
                    </div>
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {repoSettingsUrl && (
                        <a
                            href={repoSettingsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-btn"
                            style={{
                                flex: '1 1 200px', padding: '12px',
                                fontFamily: "'Inter',sans-serif",
                                fontSize: '14px', textDecoration: 'none',
                                textAlign: 'center', cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            {w.goto_settings}
                        </a>
                    )}
                    <button
                        onClick={onClose}
                        className="px-border"
                        style={{
                            flex: '1 1 120px', padding: '12px',
                            borderRadius: 8,
                            background: 'var(--px-bg)',
                            color: 'var(--px-muted)',
                            fontFamily: "'Inter',sans-serif",
                            fontSize: '14px', cursor: 'pointer', fontWeight: 600,
                            transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                    >
                        {w.close}
                    </button>
                </div>
            </div>
        </div>
    );
}
