// Youmember-Sandwich – Offline-Speicher
// Mit Internet: holt immer die neueste Version (und speichert sie).
// Ohne Internet: nimmt die gespeicherte Version.
const CACHE = 'youmember-sandwich';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // WLAN ohne Internet kann hängen – nach 3 Sekunden auf gespeicherte Version wechseln
      const res = await withTimeout(fetch(req, { cache: 'no-cache' }), 3000);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true }))
          || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined)
          || Response.error();
    }
  })());
});
