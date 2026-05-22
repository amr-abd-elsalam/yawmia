// ═══════════════════════════════════════════════════════════════
// sw.js — يوميّة Service Worker (PWA)
// Strategy: Cache-first for static assets, Network-first for API
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'yawmia-v0.54.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/profile.html',
  '/admin.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/auth.js',
  '/assets/js/jobs.js',
  '/assets/js/profile.js',
  '/assets/js/admin.js',
  '/user.html',
  '/assets/js/user.js',
  '/assets/js/icons.js',
  '/assets/js/utils.js',
  '/assets/js/toast.js',
  '/assets/js/modal.js',
  '/assets/js/jobCard.js',
  '/assets/js/panels.js',
  '/assets/js/ratingModal.js',
  '/assets/js/livePresence.js',
  '/assets/js/instantMatch.js',
  '/assets/js/talentRadar.js',
  '/assets/js/adForm.js',
  '/assets/js/directOffer.js',
  '/assets/js/workroom.js',
  '/job.html',
  '/assets/js/jobDetail.js',
  '/assets/css/tokens.css',
  '/assets/fonts/Cairo-Regular.woff2',
  '/assets/fonts/Cairo-SemiBold.woff2',
  '/assets/fonts/Cairo-Bold.woff2',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/offline.html',
  '/terms.html',
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strategy per request type ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network-first (never cache API responses)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(
          JSON.stringify({ error: 'أنت offline حالياً', code: 'OFFLINE' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // Static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          // Cache successful GET responses for future use
          if (networkResponse.ok && event.request.method === 'GET') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Offline fallback for HTML pages
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/offline.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// ── Push: display notification ──
self.addEventListener('push', (event) => {
  let data = { title: 'يوميّة', body: 'إشعار جديد', icon: '/assets/img/icon-192.png', url: '/dashboard.html' };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.title) data.title = payload.title;
      if (payload.body) data.body = payload.body;
      if (payload.icon) data.icon = payload.icon;
      if (payload.url) data.url = payload.url;
    } catch (_) {
      // Invalid JSON or no payload — use defaults
      try {
        const text = event.data.text();
        if (text) data.body = text;
      } catch (_2) { /* ignore */ }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/assets/img/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url },
    })
  );
});

// ── Notification Click: navigate to URL ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/dashboard.html';

  const url = sanitizeNotificationUrl(rawUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(url, self.location.origin);

          if (clientUrl.origin === targetUrl.origin) {
            if ('navigate' in client && clientUrl.pathname + clientUrl.search + clientUrl.hash !== url) {
              return client.navigate(url).then((c) => c && c.focus ? c.focus() : client.focus());
            }
            if ('focus' in client) return client.focus();
          }
        } catch (_) {
          // Try next client.
        }
      }

      return clients.openWindow(url);
    })
  );
});

function sanitizeNotificationUrl(url) {
  if (!url || typeof url !== 'string') return '/dashboard.html';

  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed.startsWith('/')) return '/dashboard.html';
  if (lower.startsWith('//')) return '/dashboard.html';
  if (lower.startsWith('http://')) return '/dashboard.html';
  if (lower.startsWith('https://')) return '/dashboard.html';
  if (lower.startsWith('javascript:')) return '/dashboard.html';
  if (lower.startsWith('data:')) return '/dashboard.html';
  if (trimmed.includes('\\')) return '/dashboard.html';
  if (trimmed.includes('..')) return '/dashboard.html';

  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded.includes('\\') || decoded.includes('..')) return '/dashboard.html';
  } catch (_) {
    return '/dashboard.html';
  }

  const allowed = [
    '/dashboard.html',
    '/profile.html',
    '/job.html',
    '/user.html',
    '/terms.html'
  ];

  return allowed.some((prefix) => trimmed.startsWith(prefix))
    ? trimmed
    : '/dashboard.html';
}
