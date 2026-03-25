/**
 * field-sw.js — FlowGuard Field PWA Service Worker
 *
 * Handles:
 *   • install  — caches app shell
 *   • activate — clears old caches
 *   • fetch    — cache-first for shell assets, network-first for API
 *   • push     — shows notification when dispatcher sends a job
 *   • notificationclick — opens field.html and focuses it
 */

const CACHE  = 'fg-field-v1';
const SHELL  = [
  '/field.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

/* ── Install: pre-cache app shell ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache what we can; ignore failures on optional assets
      return Promise.allSettled(SHELL.map(url => cache.add(url)));
    })
  );
});

/* ── Activate: remove stale caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for shell, network-first for API ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network-first for API calls
  if (url.hostname === 'api.flowguard.ng') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback — return cached field.html for navigation requests
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/field.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ success: false, error: 'Offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


/* ── Push: show notification when a job is dispatched ── */
self.addEventListener('push', event => {
  let data = {
    title: 'FlowGuard Field',
    body:  'New job dispatched to your team.',
    severity: 'high',
    alertId: null
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  // Severity → badge/icon tint (colour cannot be set in notification API,
  // but the tag groups multiple notifications from the same alert)
  const sevEmoji = {
    critical: '🔴',
    high:     '🟠',
    moderate: '🟡',
    minor:    '🟢'
  }[data.severity] || '🔵';

  const title = `${sevEmoji} ${data.title}`;
  const body  = data.body;

  const options = {
    body,
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     `fg-job-${data.alertId || 'dispatch'}`,
    renotify: true,
    requireInteraction: data.severity === 'critical' || data.severity === 'high',
    data: {
      url:     '/field.html',
      alertId: data.alertId
    },
    actions: [
      { action: 'open',    title: 'View Job' },
      { action: 'dismiss', title: 'Dismiss'  }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});


/* ── notificationclick: open/focus field.html ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/field.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If field.html is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes('field.html') && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', alertId: event.notification.data?.alertId });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
