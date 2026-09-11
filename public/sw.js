/* Folia caches its public application shell and immutable assets only.
 * Account/workspace data and its pending queue belong to the application's
 * scoped persistence layer, which rechecks permissions after reconnection. */
const CACHE_PREFIX = 'folia-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL = '/';
let refreshingShell;

function refreshPublicShell() {
  if (refreshingShell) return refreshingShell;
  refreshingShell = (async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fetch a fresh public document independently from any authenticated
    // navigation. Keep the previous shell usable until every new asset exists.
    const response = await fetch(new Request(SHELL, { credentials: 'omit', cache: 'reload' }));
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
      throw new Error('The public application shell is unavailable.');
    const publicShell = response.clone();
    const html = await response.text();
    const assets = [
      ...new Set(
        [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)].map((match) => match[1]),
      ),
    ];
    if (!assets.length) throw new Error('The public shell did not reference application assets.');
    // Stage all successful responses before changing the offline document.
    const staged = await Promise.all(
      assets.map(async (asset) => {
        const result = await fetch(new Request(asset, { credentials: 'omit', cache: 'reload' }));
        if (!result.ok) throw new Error('An updated application asset is unavailable.');
        return { asset, result };
      }),
    );
    await Promise.all(staged.map(({ asset, result }) => cache.put(asset, result)));
    // This is the publication step. A failed fetch/cache write above retains
    // the earlier shell and its still-cached hashed assets for offline use.
    await cache.put(SHELL, publicShell);
  })().finally(() => {
    refreshingShell = undefined;
  });
  return refreshingShell;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await refreshPublicShell();
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
        '/icons/folia.svg',
      ]);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Updating executable assets must not delete productivity data or queues.
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_PRIVATE_CACHES') {
    event.waitUntil(
      (async () => {
        for (const name of await caches.keys()) {
          if (name.startsWith('folia-private-')) await caches.delete(name);
        }
        event.ports[0]?.postMessage({ cleared: true });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Authentication, payments, invitations, and all APIs always use the network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/billing') ||
    url.pathname.startsWith('/account')
  )
    return;
  if (request.mode === 'navigate') {
    if (
      url.searchParams.has('code') ||
      url.searchParams.has('token') ||
      url.searchParams.has('checkout')
    )
      return;
    const networkResponse = fetch(request);
    event.waitUntil(
      networkResponse
        .then((response) => (response.ok ? refreshPublicShell() : undefined))
        .catch(() => undefined),
    );
    event.respondWith(
      networkResponse.catch(async () => {
        const cached = await caches.match(SHELL, { cacheName: CACHE_NAME });
        return (
          cached ??
          new Response(
            'Folia has not finished preparing offline access. Reconnect and open it once.',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
          )
        );
      }),
    );
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
