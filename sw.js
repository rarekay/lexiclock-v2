const CACHE = 'lexiclock-v20';

const CORE = [
  '/', '/index.html', '/style.css',
  '/app.v2.0.js', '/explore.v2.3.js',
  '/manifest.json', '/icons/icon.svg',
  '/words/csw.txt', '/words/nwl2023.txt', '/words/wotd.json'
];

const ICONS = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.49.0/dist/';
const EXTRA = [
  ICONS + 'tabler-icons.min.css',
  ICONS + 'fonts/tabler-icons.woff2?v3.49.0'
];

// Cache each file separately so one bad filename can't block the rest
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled([...CORE, ...EXTRA].map(url =>
        fetch(url, { cache: 'reload' }).then(res => {
          if (!res.ok) throw new Error(url + ' ' + res.status);
          return cache.put(url, res);
        })
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: fresh when online, cached index.html when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // Everything else: cache first, then network (and remember it)
  e.respondWith(
    caches.match(req, { ignoreSearch: url.origin === self.location.origin }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
    self.clients.claim();
  }
});
