// LOA_VERSION 0.99.104 (the app reads this to tell a newer version is out; bump.py keeps it current)
// Library of Alexandria, web app service worker (v0.99.54).
// The app's own files are kept for offline use and refreshed from the network whenever it is reachable (network first),
// so a new version appears on the next launch. v0.99.93: every request skips the browser's own 10-minute HTTP cache (cache: 'no-cache'),
// so a phone never mixes an old app.js with a new page, and version.json is never cached. Card data and pictures from Scryfall go straight to the network; the app
// keeps its own copies of those in IndexedDB.
const CACHE = 'loa-shell-v2';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  if (/\/version\.json$/.test(u.pathname)) { e.respondWith(fetch(new Request(u.href, { cache: 'no-store' }))); return; }
  const req = e.request.mode === 'navigate' ? new Request(u.href, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
