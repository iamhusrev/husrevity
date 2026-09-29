/** Channel-agnostic notification payload — the same shape for every Notifier implementation. */
export interface NotifierPayload {
  id: string;
  title: string;
  body: string;
  deepLink: string;
  kind: string;
}

/**
 * One send target + one payload -> one delivery attempt. `send` throws on
 * failure (matching web-push's own contract) — the caller decides what a
 * failure means (retry, drop the target, log and move on).
 *
 * Only `WebPushNotifier` exists today. `ApnsNotifier`/`TelegramNotifier`
 * land with their respective phases (iOS/Telegram) — not stubbed here.
 */
export interface Notifier<TTarget> {
  send(target: TTarget, payload: NotifierPayload): Promise<void>;
}
