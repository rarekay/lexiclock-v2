const CACHE = 'lexiclock-v11';
const ASSETS = [
  '/','/index.html','/style.css',
  '/app.v2.0.js','/explore.v2.1.js','/train.v2.0.js',
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
    // Network first for HTML — always try to get fresh HTML
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache first for everything else
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

// Only skip waiting when user explicitly taps Reload in the banner
self.addEventListener('message', e => {
  if (e.data?.action === 'skipWaiting') {
    self.skipWaiting();
    // After skipWaiting, claim all clients so they get the update
    self.clients.claim();
  }
});
