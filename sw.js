/* ============================================================
   EKK STORE — Service Worker 4.0
   - Cache app shell (HTML/CSS/JS/fonts) dengan stale-while-revalidate
   - Skip caching untuk API, Firebase, Cloudinary
   - Support push notification + notification click
   ============================================================ */

const SW_VERSION = 'ekk-store-v2.0.0';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon/ekkstore-192.png',
    '/icon/ekkstore-512.png',
    '/?source=pwa',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', (event) => {
    console.log('[SW] Install', SW_VERSION);
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_ASSETS).catch((e) => console.warn('[SW] Pre-cache partial fail:', e)))
            .then(() => self.skipWaiting())
    );
});

/* ============================================================
   ACTIVATE
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

    // Navigation requests → network first, fallback ke cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
                    return response;
                })
                .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
        );
        return;
    }

    // Same-origin assets & CSS/JS/fonts → stale-while-revalidate
    const isCacheable = ['style', 'script', 'font', 'image'].includes(request.destination)
        || url.hostname === self.location.hostname
        || url.hostname.includes('fonts.g')
        || url.hostname.includes('cdnjs');

    if (!isCacheable) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const copy = response.clone();
                        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || networkFetch;
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
   MESSAGE (dari client)
   ============================================================ */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});