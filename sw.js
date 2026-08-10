const CACHE = 'lexiclock-v19';
const ASSETS = [
  '/','/index.html','/style.css',
  '/app.v2.1.js','/explore.v2.1.js',
  '/manifest.json','/icons/icon.svg',
  '/words/csw.txt','/words/nwl2023.txt','/words/wotd.json','/words/invalid_words.json'
];

self.addEventListener('install', e => {
  // Cache all assets then wait — do NOT skipWaiting automatically
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  // Clean old caches but do NOT claim clients automatically
  // Claiming immediately causes the controllerchange reload race condition
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  // Only claim if this is a fresh install (no existing controller)
  // This prevents the banner-then-instant-reload bug
  if (!self.registration.active) {
    self.clients.claim();
  }
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' ||
    url.pathname === '/' || url.pathname.endsWith('.html');

  if (isHTML) {
    // Network-first for HTML — always try fresh online.
    // When offline, don't rely on an exact URL match (iOS can launch an
    // installed PWA with a slightly different URL than what got cached).
    // Fall back to the cached index.html specifically, ignoring the
    // exact request URL and query string.
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put('/index.html', clone));
          return res;
        })
        .catch(() =>
          caches.match('/index.html', { ignoreSearch: true })
            .then(cached => cached || caches.match('/', { ignoreSearch: true }))
        )
    );
    return;
  }

  // Cache-first for everything else, including cross-origin resources
  // like the icon font CDN. Anything fetched successfully while online
  // gets cached automatically, so it's available offline afterward.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
