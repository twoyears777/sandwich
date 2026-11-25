/*
  YOUMEMBER-SANDWICH – Offline-Speicher ("Service Worker")

  Was diese Datei macht:
  - Mit Internet: holt beim Start die neueste Version von GitHub und speichert sie.
  - Ohne Internet (oder wenn es länger als 3 Sekunden dauert): nimmt die gespeicherte Version.
  - Sicherheitsprüfung: Eine neue Version wird NUR gespeichert, wenn es wirklich die App ist.
    Eine WLAN-Anmeldeseite, eine Fehlerseite von GitHub oder eine Weiterleitung
    wird nie gespeichert – sonst wäre die App danach offline kaputt.
*/
const CACHE = 'youmember-sandwich';
const KENNUNG = 'youmember-sandwich-app';   // steht in index.html (meta "app-kennung")
const DATEIEN = ['./', './index.html', './manifest.json', './icon-180.png', './icon-512.png'];
const WARTEZEIT_MS = 3000;

// Ist das wirklich eine Datei unserer App?
async function istEcht(req, res) {
  if (!res || !res.ok || res.redirected || res.type === 'opaqueredirect') return false;
  if (res.url && new URL(res.url).origin !== self.location.origin) return false;
  const pfad = new URL(req.url).pathname;
  const istSeite = req.mode === 'navigate' || pfad.endsWith('/') || pfad.endsWith('.html');
  if (istSeite) {
    const text = await res.clone().text();
    return text.includes(KENNUNG);
  }
  return true;
}

// Installation: alle Dateien holen und prüfen. Klappt das nicht, bleibt die alte Version aktiv.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE + '-neu');
    for (const datei of DATEIEN) {
      const req = new Request(datei, { cache: 'reload' });
      const res = await fetch(req);
      if (!(await istEcht(req, res))) throw new Error('Ungültige Datei: ' + datei);
      await cache.put(req, res);
    }
    // Erst wenn alles geprüft ist, wird der echte Speicher ersetzt
    const alt = await caches.open(CACHE);
    for (const req of await cache.keys()) await alt.put(req, await cache.match(req));
    await caches.delete(CACHE + '-neu');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function mitZeitlimit(promise, ms) {
  return new Promise((ok, fehler) => {
    const t = setTimeout(() => fehler(new Error('Zeit abgelaufen')), ms);
    promise.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); fehler(e); });
  });
}

// Jede Anfrage der App: erst Internet versuchen, sonst gespeicherte Version
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const gespeichert = async () =>
      (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    try {
      const res = await mitZeitlimit(fetch(req, { cache: 'no-cache' }), WARTEZEIT_MS);
      if (await istEcht(req, res)) {
        await cache.put(req, res.clone());
        return res;
      }
      // Antwort ist nicht unsere App (Anmeldeseite, Fehler …) → gespeicherte Version zeigen
      return (await gespeichert()) || res;
    } catch (err) {
      return (await gespeichert()) || Response.error();
    }
  })());
});
