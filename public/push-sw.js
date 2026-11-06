// Avisos de Saldao (Web Push): el service worker los muestra y, al tocarlos, abre la app donde corresponde.
// Lo carga el service worker principal (vite.config.ts → workbox.importScripts).
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Saldao', {
    body: d.body || '', icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: d.tag, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    if (open) { if ('navigate' in open) open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
