# Corrección: Componente de Subida de Archivos Estáticos

## Contexto

El backend ya está funcionando y probado. El endpoint real difiere del que estaba especificado anteriormente. Este documento tiene los valores correctos que debe usar el frontend.

## Endpoint real (probado y funcionando)

```
POST /api/deploy/upload
Content-Type: multipart/form-data
```

### Campos del formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `subdomain` | string | Nombre del sitio. Solo `[a-z0-9-]`. Se convierte en el subdominio. |
| `file` | File (.zip) | Archivo zip con los archivos estáticos. Debe tener `index.html` en la raíz. |

### Respuesta exitosa

```json
{
  "status": "success",
  "url": "https://mi-sitio.stardest.com",
  "message": "Archivo desplegado exitosamente",
  "deployedAt": "2026-05-21T05:39:07.586Z"
}
```

### Respuesta de error

```json
{
  "status": "error",
  "message": "descripción del error"
}
```

---

## Qué corregir en el componente StaticDeploy.jsx

El componente anterior usaba valores incorrectos. Estos son los 4 cambios:

| | Antes (incorrecto) | Ahora (correcto) |
|---|---|---|
| Endpoint | `/api/upload-static` | `/api/deploy/upload` |
| Campo nombre | `site` | `subdomain` |
| Campo archivo | `zip` | `file` |
| Check de éxito | `data.ok === true` | `data.status === "success"` |

---

## Componente corregido completo

```jsx
// StaticDeploy.jsx
// Dependencia: npm install jszip
import { useState, useRef } from 'react';
import JSZip from 'jszip';

export default function StaticDeploy() {
  const [subdomain, setSubdomain]   = useState('');
  const [status, setStatus]         = useState('idle'); // idle | uploading | done | error
  const [progress, setProgress]     = useState(0);
  const [resultUrl, setResultUrl]   = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function addEntryToZip(zip, entry, basePath = '') {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file((file) => { zip.file(basePath + file.name, file); resolve(); }, reject);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries) => {
          for (const child of entries) await addEntryToZip(zip, child, basePath + entry.name + '/');
          resolve();
        }, reject);
      }
    });
  }

  async function buildZipFromItems(items) {
    const zip = new JSZip();
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;
      if (entry.isDirectory) {
        const reader = entry.createReader();
        await new Promise((resolve, reject) => {
          reader.readEntries(async (entries) => {
            for (const child of entries) await addEntryToZip(zip, child, '');
            resolve();
          }, reject);
        });
      } else {
        await addEntryToZip(zip, entry, '');
      }
    }
    return zip.generateAsync({ type: 'blob' });
  }

  function uploadZip(zipBlob) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('subdomain', subdomain);   // campo correcto
      formData.append('file', zipBlob, `${subdomain}.zip`); // campo correcto

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(30 + Math.round((e.loaded / e.total) * 60));
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          if (data.status === 'success') { // check correcto
            setProgress(100);
            setStatus('done');
            setResultUrl(data.url);
            resolve();
          } else {
            setStatus('error');
            setErrorMsg(data.message || 'Error desconocido');
            reject(new Error(data.message));
          }
        } else {
          setStatus('error');
          setErrorMsg(`Error del servidor: ${xhr.status}`);
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        setStatus('error');
        setErrorMsg('Error de red al subir los archivos.');
        reject(new Error('Network error'));
      };

      xhr.open('POST', '/api/deploy/upload'); // endpoint correcto
      xhr.send(formData);
    });
  }

  async function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);

    if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
      setErrorMsg('Escribe un subdominio válido antes de subir.');
      return;
    }

    setStatus('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      const items = Array.from(e.dataTransfer.items);
      const files = Array.from(e.dataTransfer.files);
      let zipBlob;

      if (files.length === 1 && files[0].name.endsWith('.zip')) {
        zipBlob = files[0];
        setProgress(30);
      } else {
        setProgress(10);
        zipBlob = await buildZipFromItems(items);
        setProgress(30);
      }

      await uploadZip(zipBlob);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  }

  async function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
      setErrorMsg('Escribe un subdominio válido primero.');
      return;
    }
    setStatus('uploading');
    setProgress(30);
    setErrorMsg('');
    try {
      await uploadZip(file);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  }

  function reset() {
    setStatus('idle');
    setProgress(0);
    setResultUrl('');
    setErrorMsg('');
    setSubdomain('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: 'sans-serif', padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Subir archivos estáticos</h2>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Subdominio</span>
        <input
          type="text"
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="mi-sitio"
          disabled={status === 'uploading'}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
        />
      </label>
      {subdomain && (
        <p style={{ margin: '-8px 0 16px', fontSize: 13, color: '#6b7280' }}>
          URL resultante: <strong style={{ color: '#111' }}>{subdomain}.stardest.com</strong>
        </p>
      )}

      {status === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${isDragging ? '#4f46e5' : '#d1d5db'}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: isDragging ? '#eef2ff' : '#f9fafb', transition: 'all 0.15s', userSelect: 'none' }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Arrastra tu carpeta o <code>.zip</code> aquí</p>
          <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>o haz clic para seleccionar un archivo</p>
          <input ref={inputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {status === 'uploading' && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>Subiendo... {progress}%</p>
          <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{ background: '#4f46e5', width: `${progress}%`, height: '100%', borderRadius: 99, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ marginTop: 8, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>✅ Deploy completado</p>
          <a href={resultUrl} target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>{resultUrl}</a>
          <br />
          <button onClick={reset} style={{ marginTop: 12, padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Nuevo deploy
          </button>
        </div>
      )}

      {(status === 'error' || errorMsg) && (
        <div style={{ marginTop: 8, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>❌ {errorMsg}</p>
          <button onClick={reset} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Resumen para la IA

El servidor ya está funcionando. Solo hay que corregir el frontend. Los únicos 4 cambios son:

1. Endpoint: `/api/deploy/upload`
2. Campo nombre del sitio: `subdomain`
3. Campo archivo: `file`
4. Check de éxito: `data.status === "success"`

No tocar nada del servidor ni del backend.
