// sw.js - Ekk Store Professional Push Notification

const DEFAULT_URL = 'https://deploy.project.ekkstore.web.id/';
const DEFAULT_ICON = 'https://files.catbox.moe/kzg0nc.png';
const DEFAULT_BADGE = 'https://files.catbox.moe/kzg0nc.png';

// ==========================================
// INSTALL
// ==========================================
self.addEventListener('install', event => {
  event.waitUntil(
    self.skipWaiting()
  );
});

// ==========================================
// ACTIVATE
// ==========================================
self.addEventListener('activate', event => {
  event.waitUntil(
    clients.claim()
  );
});

// ==========================================
// PUSH NOTIFICATION
// ==========================================
self.addEventListener('push', event => {

  let data = {};

  // Membaca data yang dikirim server
  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      // Jika payload hanya berupa text biasa
      data = {
        title: 'Ekk Store',
        body: event.data.text()
      };
    }
  }

  // Judul notif
  const title = data.title || 'Ekk Store';

  // Pengaturan notif
  const options = {

    // Isi pesan dari Telegram
    body: data.body || 'Ada pesan baru dari Ekk Store 👋',

    // Logo Ekk Store
    icon: data.icon || DEFAULT_ICON,

    // Icon kecil di status bar
    badge: data.badge || DEFAULT_BADGE,

    // Getaran notif
    vibrate: [150, 80, 150],

    // Waktu notif
    timestamp: Date.now(),

    // ID/group notif
    tag: data.tag || 'ekk-store',

    // Jika notif dengan tag yang sama diperbarui,
    // HP akan memberi tahu user lagi
    renotify: true,

    // Data yang dibawa ketika notif diklik
    data: {
      url: data.url || DEFAULT_URL
    },

    // Tombol pada notif
    actions: [
      {
        action: 'open',
        title: 'Buka'
      },
      {
        action: 'close',
        title: 'Tutup'
      }
    ]
  };

  // ========================================
  // OPTIONAL IMAGE
  // ========================================
  // Kalau server mengirim:
  //
  // "image": "https://..."
  //
  // maka browser akan mencoba menampilkan
  // gambar besar pada notif.
  if (data.image) {
    options.image = data.image;
  }

  // ========================================
  // TAMPILKAN NOTIF
  // ========================================
  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

// ==========================================
// NOTIFICATION CLICK
// ==========================================
self.addEventListener('notificationclick', event => {

  event.notification.close();

  // Tombol "Tutup"
  if (event.action === 'close') {
    return;
  }

  // URL tujuan
  const url =
    event.notification?.data?.url ||
    DEFAULT_URL;

  event.waitUntil(
    openWebsite(url)
  );
});

// ==========================================
// BUKA / FOCUS WEBSITE
// ==========================================
async function openWebsite(url) {

  const windowClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // Cari website Ekk Store yang sudah terbuka
  for (const client of windowClients) {

    if (
      client.url.startsWith(
        'https://deploy.project.ekkstore.web.id'
      )
    ) {

      // Fokus ke tab yang sudah ada
      if ('focus' in client) {
        return client.focus();
      }
    }
  }

  // Kalau website belum terbuka,
  // buka tab baru
  if (clients.openWindow) {
    return clients.openWindow(url);
  }
}

// ==========================================
// NOTIFICATION CLOSE
// ==========================================
self.addEventListener('notificationclose', event => {

  // Tidak wajib melakukan apa-apa di sini.
  // Event ini hanya dipakai kalau nanti
  // lu mau menambahkan statistik notif.
});
