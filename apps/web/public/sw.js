/* eslint-disable no-restricted-globals */
/**
 * Husrevity service worker — push notifications + a thin PWA offline shell.
 *
 * Push: the backend dispatcher (NotificationDispatcherService) sends a JSON
 * payload via web-push when a notification's `scheduled_at` hits; we show it and
 * route clicks to the deep-link.
 *
 * Offline: navigations are network-first and fall back to /offline.html when the
 * network is unreachable. Build assets (/_next/static, /icons) are served
 * stale-while-revalidate. We deliberately do NOT cache HTML or API responses —
 * that would fight Next.js revalidation and serve stale app data.
 */

const CACHE = "husrevity-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // App navigations: network-first, fall back to the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets + icons: stale-while-revalidate.
  if (isCacheableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
  // Everything else: passthrough (no SW interference).
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Husrevity", body: event.data.text() };
  }
  const title = payload.title || "Husrevity";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.id ? `husrevity-${payload.id}` : undefined,
    data: {
      deepLink: payload.deepLink || "/dashboard",
      id: payload.id,
      kind: payload.kind,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Reuse an open tab when possible — feels less jarring than spawning
        // a new window every notification click.
        for (const client of clientList) {
          if ("focus" in client) {
            const url = new URL(client.url);
            if (url.origin === self.location.origin) {
              client.postMessage({ type: "husrevity-notification-click", deepLink });
              return client.focus().then(() => client.navigate(deepLink));
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(deepLink);
        }
      }),
  );
});
