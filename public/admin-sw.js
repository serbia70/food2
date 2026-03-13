const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const CACHE_PREFIX = `meituango-admin-${scopePath}-v`;
const CACHE_NAME = `${CACHE_PREFIX}1`;
const APP_SHELL = [
  scopePath,
  `${scopePath}/`,
  `${scopePath}/manifest.webmanifest`,
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const inScope = url.pathname === scopePath || url.pathname.startsWith(`${scopePath}/`);
  const isAsset =
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg';

  if (!inScope && !isAsset) return;

  if (request.mode === 'navigate' && inScope) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match(scopePath)) ||
            (await cache.match(`${scopePath}/`))
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
      } catch {
        return fetch(request);
      }
    })
  );
});
