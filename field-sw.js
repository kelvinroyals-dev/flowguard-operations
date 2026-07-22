'use strict';

const CACHE_NAME  = 'fg-field-v5';
const SYNC_TAG    = 'fg-report-sync';
const DRAFT_KEY   = 'fg_draft_queue';

// Assets to pre-cache on install (app shell)
const SHELL = [
  '/field.html',
  '/manifest.json',
];

// ── Install: cache shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // drop every previous cache generation
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));

    // Previous versions cached authenticated API responses. Those are already
    // sitting on crews' handsets — a prior user's alerts, properties and team
    // data, served to whoever opens the app next. Evict them explicitly; simply
    // no longer writing new ones would leave the old leak in place.
    const cache = await caches.open(CACHE_NAME);
    const reqs = await cache.keys();
    await Promise.all(reqs.map(r => {
      const u = new URL(r.url);
      if (u.hostname.includes('api.flowguard') || u.pathname.startsWith('/socket.io')) {
        return cache.delete(r);
      }
      return null;
    }));

    await self.clients.claim();
  })());
});

// ── Fetch: cache-first for shell, network-first for API ──────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── API + sockets: NEVER cached ──────────────────────────────────────
  // These responses are authenticated and user-specific. Caching them keys
  // the data by URL alone, so after logout — or for the next crew member on
  // a shared handset — caches.match() would serve the previous user's
  // properties, alerts and team data straight back. Always hit the network;
  // if we're offline, fail honestly rather than lie with someone else's data.
  if (url.hostname.includes('api.flowguard') || url.pathname.startsWith('/socket.io')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ success: false, error: 'Offline — no connection to FlowGuard.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // Font requests — network first with cache fallback
  if (url.hostname.includes('fonts.')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // App shell — cache first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const authed = request.headers.has('Authorization') || request.credentials === 'include';
    if (response.ok && !authed) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback: return cached field.html for navigation
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/field.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // never cache anything carrying credentials, belt-and-braces
    const authed = request.headers.has('Authorization') || request.credentials === 'include';
    if (response.ok && request.method === 'GET' && !authed) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ success: false, error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Background Sync: flush draft queue ───────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushDrafts());
  }
});

async function flushDrafts() {
  // Read draft queue from all clients' localStorage via IDB mirror
  const clients = await self.clients.matchAll({ type: 'window' });

  for (const client of clients) {
    // Ask the page to flush its own queue — it has the token
    client.postMessage({ type: 'FG_FLUSH_DRAFTS' });
  }
}

// ── Push notifications ────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'FlowGuard', body: event.data?.text() || 'New dispatch' }; }

  const title   = data.title || 'FlowGuard Field';
  const options = {
    body:    data.body    || 'New job dispatched to your team.',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     data.tag     || 'fg-dispatch',
    renotify: true,
    data:    { url: data.url || '/field.html' },
    actions: [
      { action: 'view', title: 'View Job' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/field.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/field') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Message handler: reply to page requests ───────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
