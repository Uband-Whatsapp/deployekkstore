/* ============================================================
   EKK STORE — Service Worker 5.0
   - Cache app shell + semua halaman (multi-page)
   - Navigation: NETWORK-FIRST (HTML selalu fresh)
   - Assets: NETWORK-FIRST dengan fallback cache (anti broken-cache)
   - Auto purge cache lama saat version bump
   - Support push notification + notification click
   ============================================================ */

const SW_VERSION = 'ekk-store-v5.0.1';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/deploy',
    '/deploy/',
    '/deploy/index.html',
    '/history',
    '/history/',
    '/history/index.html',
    '/group',
    '/group/',
    '/group/index.html',
    '/docs',
    '/docs/',
    '/docs/index.html',
    '/info',
    '/info/',
    '/info/index.html',
    '/status',
    '/status/',
    '/status/index.html',
    '/download',
    '/download/',
    '/download/index.html',
    '/services',
    '/services/',
    '/services/index.html',
    '/css/style.css',
    '/js/common.js',
    '/js/home.js',
    '/js/deploy.js',
    '/js/history.js',
    '/js/group.js',
    '/manifest.json',
    '/icon/ekkstore-192.png',
    '/icon/ekkstore-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

/* ============================================================
   INSTALL — pre-cache shell
   ============================================================ */
self.addEventListener('install', (event) => {
    console.log('[SW] Install', SW_VERSION);
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => {
                // addAll gagal total kalau 1 file 404.
                // Jadi add satu-satu biar partial-fail tetap jalan.
                return Promise.all(
                    SHELL_ASSETS.map((url) =>
                        cache.add(url).catch((e) => {
                            console.warn('[SW] Skip pre-cache:', url, '-', e.message);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

/* ============================================================
   ACTIVATE — hapus cache lama
   ============================================================ */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate', SW_VERSION);
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => {
                        console.log('[SW] Hapus cache lama:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

/* ============================================================
   FETCH
   ============================================================ */
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Skip non-GET
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Skip API, Firebase, Cloudinary, dan domain eksternal penting
    const skipHosts = [
        'firestore.googleapis.com',
        'firebaseio.com',
        'identitytoolkit.googleapis.com',
        'securetoken.googleapis.com',
        'cloudinary.com',
        'api.cloudinary.com',
        'gstatic.com',
        'google-analytics.com',
        'googletagmanager.com',
        'whatsapp.com',
        'wa.me'
    ];
    if (skipHosts.some(h => url.hostname.includes(h))) return;

    if (url.pathname.startsWith('/api/')) return;

    // ============================================================
    // NAVIGATION (HTML) → network-first, cache fallback
    // ============================================================
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => {
                    // Offline: coba cache spesifik dulu, baru fallback ke /
                    return caches.match(request).then((cached) => {
                        if (cached) return cached;
                        return caches.match('/index.html')
                            .then((r) => r || caches.match('/'));
                    });
                })
        );
        return;
    }

    // ============================================================
    // STATIC ASSETS (JS/CSS/font/img) → network-first, cache fallback
    // KUNCI: network-first biar update JS/CSS selalu ke-fetch fresh
    // ============================================================
    const isSameOrigin = url.hostname === self.location.hostname;
    const isCacheable = ['style', 'script', 'font', 'image'].includes(request.destination)
        || isSameOrigin
        || url.hostname.includes('fonts.g')
        || url.hostname.includes('cdnjs');

    if (!isCacheable) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cuma cache response yang valid
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
                }
                return response;
            })
            .catch(() => {
                // Network fail (offline) → fallback ke cache
                return caches.match(request).then((cached) => {
                    if (cached) return cached;
                    // Cache miss → coba di SHELL_CACHE juga
                    return caches.open(SHELL_CACHE).then((cache) => cache.match(request));
                });
            })
    );
});

/* ============================================================
   PUSH NOTIFICATION
   ============================================================ */
self.addEventListener('push', (event) => {
    console.log('[SW] Push diterima');
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Ekk Store', body: event.data ? event.data.text() : 'Notifikasi baru' };
    }

    const title = data.title || 'Ekk Store';
    const options = {
        body: data.body || 'Ada pembaruan baru dari Ekk Store.',
        icon: data.icon || 'https://files.catbox.moe/kzg0nc.png',
        badge: data.badge || 'https://files.catbox.moe/kzg0nc.png',
        tag: data.tag || 'ekk-store-notif',
        data: {
            url: data.url || '/',
            ...data.data
        },
        vibrate: [100, 50, 100],
        requireInteraction: false
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

/* ============================================================
   NOTIFICATION CLICK
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click');
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => client.navigate(url)).catch(() => client.focus());
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

/* ============================================================
   MESSAGE (dari client) — untuk skip waiting dari halaman
   ============================================================ */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});