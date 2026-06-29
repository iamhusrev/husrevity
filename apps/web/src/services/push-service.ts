import { notificationService } from "./notification-service";

const PUSH_PREFERENCE_KEY = "husrevity.pushEnabled";

/**
 * Browser-side Web Push lifecycle helpers.
 *
 * The user's *intent* (do they want push?) is mirrored to localStorage so we
 * can silently re-subscribe after page reload without re-prompting. The
 * *actual* subscription lives in the browser's Push Manager + our backend.
 *
 * `enablePush`:  request permission → register SW → subscribe → POST to API.
 * `disablePush`: unsubscribe locally + DELETE on API + clear preference.
 * `registerIfPreviouslyEnabled`: silent re-subscribe on app boot (after login).
 */

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export const pushService = {
  isSupported,

  permissionState(): NotificationPermission | "unsupported" {
    if (!isSupported()) return "unsupported";
    return Notification.permission;
  },

  preferenceEnabled(): boolean {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PUSH_PREFERENCE_KEY) === "1";
  },

  async getCurrentSubscription(): Promise<PushSubscription | null> {
    if (!isSupported()) return null;
    try {
      // The SW is registered with scope "/" (see providers.tsx). getRegistration
      // matches by the document URL within scope, NOT by script URL — passing
      // "/sw.js" misses the "/"-scoped registration and returns undefined even
      // when the user is subscribed. The no-arg form resolves the registration
      // controlling the current page. (Don't use serviceWorker.ready here — it
      // never resolves when no SW is registered and would hang disablePush.)
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return null;
      return (await reg.pushManager.getSubscription()) ?? null;
    } catch {
      return null;
    }
  },

  async enablePush(): Promise<{ ok: boolean; reason?: string }> {
    if (!isSupported()) return { ok: false, reason: "unsupported" };

    // Permission first — browsers reject pushManager.subscribe if it's not granted.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: perm };

    let vapidKey: string;
    try {
      const res = await notificationService.getVapidPublicKey();
      vapidKey = res.data?.key ?? "";
    } catch {
      return { ok: false, reason: "vapid-fetch-failed" };
    }
    if (!vapidKey) return { ok: false, reason: "vapid-unconfigured" };

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
    }

    const json = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "subscription-incomplete" };
    }
    try {
      await notificationService.subscribe({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
    } catch {
      return { ok: false, reason: "backend-subscribe-failed" };
    }

    window.localStorage.setItem(PUSH_PREFERENCE_KEY, "1");
    return { ok: true };
  },

  async disablePush(): Promise<void> {
    if (!isSupported()) {
      window.localStorage.removeItem(PUSH_PREFERENCE_KEY);
      return;
    }
    const sub = await this.getCurrentSubscription();
    if (sub) {
      try {
        await notificationService.unsubscribe(sub.endpoint);
      } catch {
        // best effort — the user has expressed intent to disable, don't block
      }
      try {
        await sub.unsubscribe();
      } catch {
        // also best effort
      }
    }
    window.localStorage.removeItem(PUSH_PREFERENCE_KEY);
  },

  /**
   * On app boot after login: if the user had push enabled previously AND
   * browser permission is still granted, silently re-register the SW and
   * push subscription (a new endpoint may have been issued).
   */
  async registerIfPreviouslyEnabled(): Promise<void> {
    if (!isSupported()) return;
    if (!this.preferenceEnabled()) return;
    if (Notification.permission !== "granted") return;
    try {
      await this.enablePush();
    } catch {
      // fail silent — the bell still works
    }
  },
};

/**
 * Decode a URL-safe base64 VAPID key into a plain ArrayBuffer. We return the
 * underlying buffer (not a Uint8Array view) so the type narrows to
 * `BufferSource` cleanly — Web Push API's `applicationServerKey` rejects
 * typed-array views whose backing buffer might be a SharedArrayBuffer.
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}
