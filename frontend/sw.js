// ═══════════════════════════════════════════════════════════════
// sw.js — يوميّة Service Worker (PWA)
// Strategy: Cache-first for static assets, Network-first for API
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'yawmia-v0.21.0';
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
  '/assets/css/tokens.css',
  '/assets/fonts/Cairo-Regular.woff2',
  '/assets/fonts/Cairo-SemiBold.woff2',
  '/assets/fonts/Cairo-Bold.woff2',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/offline.html',
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
