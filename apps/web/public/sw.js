// sw.js — service worker de StarDest (PWA)
//
// Estrategias:
//   · Navegación (HTML): network-first. Siempre trae la versión nueva del sitio y,
//     sin conexión, sirve el shell cacheado para que la app abra igual.
//   · /assets/* (JS/CSS con hash de Vite): cache-first; el nombre cambia en cada build.
//   · Íconos, posters y demás estáticos: stale-while-revalidate.
//   · Nunca se cachea: /api (datos y OAuth), /webhook, /hooks, videos .mp4 (el
//     navegador los pide con Range y el SW rompería la reproducción) ni otros orígenes.

const VERSION = 'stardest-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/rocket-favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

const BYPASS = [/^\/api\//, /^\/webhook/, /^\/hooks\//, /\.mp4$/, /^\/sw\.js$/];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = (await event.preloadResponse) || (await fetch(req));
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', res.clone());   // SPA: cualquier ruta usa el mismo index.html
        }
        return res;
      } catch {
        const cached = await caches.match('/');
        return cached || new Response('<h1>Sin conexión</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(ASSET_CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached || Response.error());
    return cached || network;
  })());
});
