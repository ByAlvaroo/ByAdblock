// ByAdBlock · service worker: pide siempre a GitHub si hay cambios (si no los hay, la respuesta es instantánea),
// así cada versión nueva llega al abrir la app. Sin conexión, usa lo último que tenga el navegador.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(r)));
});
