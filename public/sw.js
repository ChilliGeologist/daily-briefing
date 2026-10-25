const CACHE_NAME = 'daily-briefing-v10';
const PRECACHE = [
  '/',
  '/style.css',
  '/reading-logic.js',
  '/edition-layout.js',
  '/told-scale.js',
  '/curl-geometry.js',
  '/thumb-index-logic.js',
  '/sun-times.js',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-only for API calls
  if (url.pathname.startsWith('/api/')) return;
  // Network first, so a new deploy is never mixed with files cached from an
  // older one (a cache-first app.js could call into a stale helper module).
  // The cache is only the offline fallback; navigations fall back to the
  // cached shell so /settings, /archive and /pipeline still boot offline.
  const fallback = e.request.mode === 'navigate' ? '/' : e.request;
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && e.request.method === 'GET') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request.mode === 'navigate' ? '/' : e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(fallback))
  );
});

// Push notification handler
self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'Daily Briefing', body: 'New briefing available' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target);
      return existing.focus();
    }
    return clients.openWindow(target);
  }));
});
