/* eslint-disable no-restricted-globals */
/**
 * Husrevity service worker — minimal, push-only.
 *
 * The backend dispatcher (NotificationDispatcherService) sends a JSON payload
 * via web-push every time a notification's `scheduled_at` hits. We just show
 * it, and on click open the deep-link in an existing tab if one is open or
 * otherwise spawn a new window.
 *
 * Nothing here intercepts fetches or caches assets — Next.js already serves
 * the app shell, and we don't want SW caching to fight Next's revalidation.
 */

self.addEventListener("install", (event) => {
  // Activate immediately on first install so the user gets push without a
  // hard reload after enabling notifications.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: "/images/logo/logo-icon.svg",
    badge: "/images/logo/logo-icon.svg",
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
