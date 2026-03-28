'use strict';

const CACHE_NAME  = 'fg-field-v3';
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
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell, network-first for API ──────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network for API and socket.io
  if (url.hostname.includes('api.flowguard') || url.pathname.startsWith('/socket.io')) {
    event.respondWith(networkFirst(event.request));
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
    if (response.ok) {
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
    if (response.ok && request.method === 'GET') {
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
