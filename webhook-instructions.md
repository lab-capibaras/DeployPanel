# Instrucciones: Mostrar configuración de webhook después del deploy

## Contexto

Cuando un usuario despliega un repositorio de GitHub desde el panel, los cambios futuros que haga en el repo **no se reflejan automáticamente** a menos que configure un webhook en GitHub que apunte a:

```
https://stardest.com/webhook
```

El backend ya tiene el endpoint `/webhook` que maneja los pushes de GitHub y redespliega automáticamente. Solo falta que el usuario sepa cómo configurarlo.

---

## Qué hay que hacer

Después de un deploy exitoso desde Git, mostrar un modal o sección con las instrucciones para configurar el webhook en GitHub.

---

## TAREA — Componente `WebhookInstructions`

Crear el componente `deploy_panel/apps/web/src/components/WebhookInstructions.jsx`:

```jsx
// WebhookInstructions.jsx
// Muestra las instrucciones para configurar el webhook de GitHub
// Props:
//   subdomain: string — el subdominio del deploy (ej: "mi-app")
//   repoUrl: string — la URL del repo (ej: "https://github.com/user/repo")
//   onClose: function — callback para cerrar el modal

import { useState } from 'react';

export default function WebhookInstructions({ subdomain, repoUrl, onClose }) {
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

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
        }}>
            <div style={{
                width: '100%', maxWidth: '520px',
                background: '#0b0f19',
                border: '1px solid rgba(47,74,103,0.6)',
                padding: '32px',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '22px', color: '#e8eeff',
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
                                fontSize: '15px', color: '#00d4ff',
                                textDecoration: 'none',
                            }}
                        >
                            {siteUrl}
                        </a>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none',
                            color: 'rgba(200,216,255,0.4)', cursor: 'pointer',
                            fontSize: '20px', lineHeight: 1, padding: '4px',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Instrucciones webhook */}
                <div style={{
                    border: '1px solid rgba(0,212,255,0.2)',
                    background: 'rgba(0,212,255,0.04)',
                    padding: '20px',
                    marginBottom: '20px',
                }}>
                    <p style={{
                        fontFamily: "'Jersey 10', monospace",
                        fontSize: '15px', color: 'rgba(200,216,255,0.7)',
                        margin: '0 0 16px',
                        lineHeight: 1.6,
                    }}>
                        Para que los cambios en tu repositorio se reflejen automáticamente, configura un webhook en GitHub:
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
                                fontSize: '13px', color: '#00d4ff',
                                minWidth: '20px',
                            }}>
                                {step.n}.
                            </span>
                            <span style={{
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '14px', color: 'rgba(200,216,255,0.7)',
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
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(47,74,103,0.5)',
                            color: '#00d4ff',
                            fontFamily: 'monospace', fontSize: '13px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {webhookUrl}
                        </code>
                        <button
                            onClick={copyWebhookUrl}
                            style={{
                                padding: '10px 16px',
                                background: copied ? 'rgba(0,212,100,0.15)' : 'rgba(0,212,255,0.1)',
                                border: `1px solid ${copied ? 'rgba(0,212,100,0.4)' : 'rgba(0,212,255,0.3)'}`,
                                color: copied ? '#00d464' : '#00d4ff',
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '14px', cursor: 'pointer',
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}
                        >
                            {copied ? '✓ Copiado' : 'Copiar'}
                        </button>
                    </div>
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    {repoSettingsUrl && (
                        <a
                            href={repoSettingsUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                flex: 1, padding: '12px',
                                background: 'rgba(0,212,255,0.1)',
                                border: '1px solid rgba(0,212,255,0.3)',
                                color: '#00d4ff',
                                fontFamily: "'Jersey 10', monospace",
                                fontSize: '15px', textDecoration: 'none',
                                textAlign: 'center', cursor: 'pointer',
                            }}
                        >
                            Ir a GitHub Settings →
                        </a>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: '12px',
                            background: 'transparent',
                            border: '1px solid rgba(47,74,103,0.5)',
                            color: 'rgba(200,216,255,0.6)',
                            fontFamily: "'Jersey 10', monospace",
                            fontSize: '15px', cursor: 'pointer',
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
```

---

## Cómo integrarlo en `Deploy.jsx`

### 1. Importar el componente

```jsx
import WebhookInstructions from '../components/WebhookInstructions';
```

### 2. Agregar estado para controlar el modal

```jsx
const [webhookInfo, setWebhookInfo] = useState(null);
// webhookInfo = { subdomain: 'mi-app', repoUrl: 'https://github.com/...' }
// o null cuando está cerrado
```

### 3. Mostrar el modal después de un deploy exitoso desde Git

Cuando el deploy de Git sea exitoso, en lugar de (o además de) mostrar el estado de éxito actual, hacer:

```jsx
// Después de recibir respuesta exitosa del deploy:
setWebhookInfo({
    subdomain: subdomain, // el subdominio que el usuario escribió
    repoUrl: repoUrl,     // la URL del repo que el usuario pegó
});
```

### 4. Renderizar el modal en el JSX

```jsx
{webhookInfo && (
    <WebhookInstructions
        subdomain={webhookInfo.subdomain}
        repoUrl={webhookInfo.repoUrl}
        onClose={() => setWebhookInfo(null)}
    />
)}
```

---

## Comportamiento esperado

1. Usuario pega URL de repo, elige rama y subdominio
2. Hace clic en "Deploy"
3. El deploy corre normalmente
4. Al terminar exitosamente, aparece el modal con:
   - URL del sitio desplegado (clickeable)
   - Instrucciones paso a paso para configurar el webhook
   - URL del webhook lista para copiar con un botón
   - Botón "Ir a GitHub Settings →" que abre directamente la página de crear webhook del repo
5. Usuario cierra el modal

---

## Nota importante

Este modal solo debe aparecer para deploys desde **Git** (no para drag & drop de archivos estáticos, ya que esos no tienen repo de GitHub asociado).
