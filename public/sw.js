const CACHE = 'theball-v1';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Hive API calls etc. go straight to network
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Echte pushes van de server (later)
self.addEventListener('push', (e) => {
  let data = { title: 'The Ball', body: 'A ball is coming.' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200, 100, 400],
    tag: 'theball',
    data: data,
  }));
});

// Lokale test-notificatie vanuit de pagina (geen server nodig)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'local-notify') {
    self.registration.showNotification(e.data.title || 'The Ball', {
      body: e.data.body || '',
      icon: './icon-192.png',
      vibrate: [200, 100, 200, 100, 400],
      tag: 'theball-local',
    });
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./');
  }));
});
