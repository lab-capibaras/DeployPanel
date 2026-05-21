// WebhookInstructions.jsx
// Muestra las instrucciones para configurar el webhook de GitHub
// Props:
//   subdomain: string — el subdominio del deploy (ej: "mi-app")
//   repoUrl: string — la URL del repo (ej: "https://github.com/user/repo")
//   onClose: function — callback para cerrar el modal

import { useState, useEffect } from 'react';
import { getPrefs, subscribePrefs } from '../store/prefs';

function useTheme() {
    const [prefs, setPrefs] = useState(getPrefs);
    useEffect(() => subscribePrefs(setPrefs), []);
    return prefs.theme === 'dark';
}

export default function WebhookInstructions({ subdomain, repoUrl, onClose }) {
    const [copied, setCopied] = useState(false);
    const isDark = useTheme();

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

    // Estilos adaptables al tema
    const modalBg = isDark ? '#0b0f19' : '#ffffff';
    const border = isDark ? '1px solid rgba(47,74,103,0.6)' : '1px solid #c3d3e5';
    const titleColor = isDark ? '#e8eeff' : '#0d1433';
    const closeBtnColor = isDark ? 'rgba(200,216,255,0.4)' : 'rgba(13,20,51,0.5)';
    const shadow = isDark ? '0 10px 30px rgba(0,0,0,0.8)' : '0 10px 30px rgba(0,0,0,0.1)';

    const stepsBoxBg = isDark ? 'rgba(0,212,255,0.04)' : 'rgba(45,95,255,0.03)';
    const stepsBoxBorder = isDark ? '1px solid rgba(0,212,255,0.2)' : '1px solid rgba(45,95,255,0.15)';
    const stepText = isDark ? 'rgba(200,216,255,0.7)' : '#4a5568';
    const stepNumber = isDark ? '#00d4ff' : '#2d5fff';

    const codeBg = isDark ? 'rgba(0,0,0,0.4)' : '#f1f5f9';
    const codeBorder = isDark ? '1px solid rgba(47,74,103,0.5)' : '1px solid #cbd5e1';
    const codeText = isDark ? '#00d4ff' : '#1e3a8a';

    const copyBtnBg = copied
        ? (isDark ? 'rgba(0,212,100,0.15)' : 'rgba(16,185,129,0.1)')
        : (isDark ? 'rgba(0,212,255,0.1)' : 'rgba(45,95,255,0.05)');
    const copyBtnBorder = copied
        ? (isDark ? 'rgba(0,212,100,0.4)' : 'rgba(16,185,129,0.3)')
        : (isDark ? 'rgba(0,212,255,0.3)' : 'rgba(45,95,255,0.25)');
    const copyBtnText = copied
        ? (isDark ? '#00d464' : '#059669')
        : (isDark ? '#00d4ff' : '#2563eb');

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15,23,42,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
        }}>
            <div style={{
                width: '100%', maxWidth: '520px',
                background: modalBg,
                border: border,
                padding: '32px',
                boxShadow: shadow,
                position: 'relative',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '24px', color: titleColor,
                            margin: '0 0 6px',
                        }}>
                            ✅ Deploy exitoso
                        </h2>
                        <a
                            href={siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '16px', color: '#00d4ff',
                                textDecoration: 'none',
                                borderBottom: '1px dashed #00d4ff',
                            }}
                            onMouseEnter={e => e.target.style.color = '#00a3cc'}
                            onMouseLeave={e => e.target.style.color = '#00d4ff'}
                        >
                            {siteUrl}
                        </a>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none',
                            color: closeBtnColor, cursor: 'pointer',
                            fontSize: '22px', lineHeight: 1, padding: '4px',
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.target.style.color = isDark ? '#ffffff' : '#000000'}
                        onMouseLeave={e => e.target.style.color = closeBtnColor}
                    >
                        ✕
                    </button>
                </div>

                {/* Instrucciones webhook */}
                <div style={{
                    border: stepsBoxBorder,
                    background: stepsBoxBg,
                    padding: '20px',
                    marginBottom: '20px',
                }}>
                    <p style={{
                        fontFamily: "'Jersey 10', monospace",
                        fontSize: '16px', color: stepText,
                        margin: '0 0 16px',
                        lineHeight: 1.6,
                    }}>
                        Para que los futuros cambios en tu repositorio se reflejen automáticamente, configura un webhook en GitHub:
                    </p>

                    {/* Pasos */}
                    {[
                        { n: 1, text: 'Ve a tu repositorio en GitHub' },
                        { n: 2, text: 'Settings → Webhooks → Add webhook' },
                        { n: 3, text: 'Pega la URL de abajo en "Payload URL"' },
                        { n: 4, text: 'Content type: application/json' },
                        { n: 5, text: 'Events: Just the push event' },
                        { n: 6, text: 'Activa el webhook y guarda' },
                    ].map(step => (
                        <div key={step.n} style={{
                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                            marginBottom: '8px',
                        }}>
                            <span style={{
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '14px', color: stepNumber,
                                minWidth: '20px',
                                fontWeight: 'bold',
                            }}>
                                {step.n}.
                            </span>
                            <span style={{
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '15px', color: stepText,
                                lineHeight: 1.5,
                            }}>
                                {step.text}
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
                            background: codeBg,
                            border: codeBorder,
                            color: codeText,
                            fontFamily: 'monospace', fontSize: '13px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {webhookUrl}
                        </code>
                        <button
                            onClick={copyWebhookUrl}
                            style={{
                                padding: '10px 16px',
                                background: copyBtnBg,
                                border: copyBtnBorder,
                                color: copyBtnText,
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '15px', cursor: 'pointer',
                                transition: 'all 0.15s steps(2)', whiteSpace: 'nowrap',
                                fontWeight: 'bold',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translate(-1px, -1px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            {copied ? '✓ Copiado' : 'Copiar'}
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
                            style={{
                                flex: '1 1 200px', padding: '12px',
                                background: 'rgba(0,212,255,0.1)',
                                border: '1px solid rgba(0,212,255,0.3)',
                                color: '#00d4ff',
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '16px', textDecoration: 'none',
                                textAlign: 'center', cursor: 'pointer',
                                fontWeight: 'bold',
                                transition: 'all 0.1s steps(2)',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(0,212,255,0.18)';
                                e.currentTarget.style.transform = 'translate(-1px, -1px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(0,212,255,0.1)';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            Ir a GitHub Settings →
                        </a>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            flex: '1 1 120px', padding: '12px',
                            background: 'transparent',
                            border: isDark ? '1px solid rgba(47,74,103,0.5)' : '1px solid #cbd5e1',
                            color: isDark ? 'rgba(200,216,255,0.6)' : '#475569',
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '16px', cursor: 'pointer',
                            transition: 'all 0.1s steps(2)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
