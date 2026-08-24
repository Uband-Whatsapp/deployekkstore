// sw.js - Ekk Store Push Notification

const DEFAULT_URL = 'https://deploy.project.ekkstore.web.id/';
const DEFAULT_ICON = 'https://files.catbox.moe/kzg0nc.png';
const DEFAULT_BADGE = 'https://files.catbox.moe/kzg0nc.png';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {

  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      data = {
        title: 'Ekk Store',
        body: event.data.text()
      };
    }
  }

  const title = data.title || 'Ekk Store';

  const options = {
    body: data.body || 'Ada pesan baru 👋',

    icon: data.icon || DEFAULT_ICON,

    badge: data.badge || DEFAULT_BADGE,

    vibrate: [150, 80, 150],

    timestamp: Date.now(),

    tag: data.tag || 'ekk-store',

    renotify: true,

    data: {
      url: data.url || DEFAULT_URL
    },

    // Hanya tombol Buka
    actions: [
      {
        action: 'open',
        title: 'Buka'
      }
    ]
  };

  // Jika server mengirim gambar,
  // gunakan sebagai gambar besar
  if (data.image) {
    options.image = data.image;
  }

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

self.addEventListener('notificationclick', event => {

  event.notification.close();

  const url =
    event.notification?.data?.url ||
    DEFAULT_URL;

  event.waitUntil(
    openWebsite(url)
  );
});

async function openWebsite(url) {

  const windowClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of windowClients) {

    if (
      client.url.startsWith(
        'https://deploy.project.ekkstore.web.id'
      )
    ) {
      return client.focus();
    }
  }

  return clients.openWindow(url);
});
