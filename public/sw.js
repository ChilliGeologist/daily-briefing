const CACHE_NAME = 'daily-briefing-v2';
const PRECACHE = ['/', '/style.css', '/app.js', '/manifest.json'];

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
  // SPA fallback: any navigation request returns the cached root index.html
  // so /settings, /archive, /pipeline all boot the shell even offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(r => r || fetch('/'))
    );
    return;
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});

// Push notification handler
self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'Daily Briefing', body: 'New briefing available' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon-192.png', badge: '/icon-192.png'
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
