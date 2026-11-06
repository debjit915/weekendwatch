/* Weekend Watch - service worker: shows order updates as phone notifications.
   The shop's server sends an empty "wake-up" push; we then ask the API what the news is. */
const API = new URL(self.location.href).searchParams.get('api') || '';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let n = { title: 'Order update', body: 'Your order has an update. Tap to see it.', code: '' };
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub && API) {
          const res = await fetch(API + '/api/push/latest', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          const d = await res.json();
          if (d && d.body) n = d;
        }
      } catch (e) { /* offline: show the generic message */ }
      await self.registration.showNotification(n.title, {
        body: n.body,
        tag: n.code || 'order',
        renotify: true,
        icon: 'assets/icon-192.png',
        badge: 'assets/icon-192.png',
        data: { code: n.code },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const code = (event.notification.data && event.notification.data.code) || '';
  const url = new URL('track.html' + (code ? '#' + code : ''), self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          return c.navigate(url).then(() => c.focus()).catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
