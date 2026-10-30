/* ALEX Code PWA cache: only same-origin application files, never script content. */
const CACHE = 'alex-code-pwa-v2';
const ASSETS = ['./','./index.html','./styles.css','./floating.css','./app.js','./floating.js','./icon.svg','./icon.png','./manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put('./index.html', copy));
      }
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached =>
    cached || fetch(req).then(response => {
      if (response.ok && new URL(req.url).pathname.endsWith(('.png'))) {
        caches.open(CACHE).then(cache => cache.put(req, response.clone()));
      }
      return response;
    })));
});
