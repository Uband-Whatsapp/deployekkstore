// sw.js - Service Worker untuk Push Notification
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Notifikasi', body: event.data.text() };
    }
  }

  const title = data.title || 'Ekk Store';
  const options = {
    body: data.body || 'Ada pesan baru dari Ekk Store',
    icon: data.icon || 'https://files.catbox.moe/kzg0nc.png',
    badge: data.badge || 'https://files.catbox.moe/kzg0nc.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || 'https://deploy.project.ekkstore.web.id/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data.url || 'https://deploy.project.ekkstore.web.id/';
  event.waitUntil(
    clients.openWindow(url)
  );
});
