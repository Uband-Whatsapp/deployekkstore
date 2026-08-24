// sw.js - Ekk Store Push Notification (Kustom)

const DEFAULT_URL = 'https://deploy.project.ekkstore.web.id/';
const DEFAULT_ICON = 'https://files.catbox.moe/kzg0nc.png'; // ganti punya kamu
const DEFAULT_BADGE = 'https://files.catbox.moe/kzg0nc.png'; // ganti punya kamu
const DEFAULT_IMAGE = 'https://files.catbox.moe/gambar-besar.jpg'; // tambahkan

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
      data = { title: 'Ekk Store', body: event.data.text() };
    }
  }

  const title = data.title || 'Ekk Store';
  const options = {
    body: data.body || 'Ada pesan baru 👋',
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_BADGE,
    image: data.image || DEFAULT_IMAGE, // gambar besar
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    tag: data.tag || 'ekk-store',
    renotify: true,
    requireInteraction: true, // tetap sampai diklik
    data: { url: data.url || DEFAULT_URL },
    actions: [
      { action: 'open', title: '🔗 Buka Website' },
      { action: 'close', title: '❌ Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const url = event.notification?.data?.url || DEFAULT_URL;

  if (action === 'open') {
    event.waitUntil(openWebsite(url));
  } else if (action === 'close') {
    // Tutup saja
  } else {
    // Jika klik notifikasi (bukan tombol)
    event.waitUntil(openWebsite(url));
  }
});

async function openWebsite(url) {
  const windowClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of windowClients) {
    if (client.url.startsWith('https://deploy.project.ekkstore.web.id')) {
      return client.focus();
    }
  }
  return clients.openWindow(url);
}
