/* WatchVerdict service worker.
 * Privacy-first: caches ONLY public static assets. Never caches authenticated
 * HTML, API responses, auth flows, or anything carrying credentials. Provides
 * an offline fallback page for navigations.
 */
const CACHE = 'wv-static-v3';
const OFFLINE_URL = '/offline';
const PRECACHE = ['/offline', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; never touch mutations or credentialed POSTs.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache auth/api/app/private responses. Let them hit the network.
  const isPrivate =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/app') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/onboarding');

  // Cache-first for immutable public static assets.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // For navigations, try network, fall back to the offline page when offline.
  if (request.mode === 'navigate' && !isPrivate) {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  if (request.mode === 'navigate' && isPrivate) {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Everything else: network only (no caching of private data).
});
