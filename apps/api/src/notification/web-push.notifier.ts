import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { Notifier, NotifierPayload } from './notifier.interface';
import { PushSubscription } from './push-subscription.entity';

/**
 * Thin wrapper around the `web-push` package's `sendNotification` call —
 * extracted behind `Notifier` so `NotificationDispatcherService` doesn't
 * depend on `web-push` directly. VAPID setup stays in the dispatcher
 * (module-global state on the `web-push` package itself, not per-instance).
 */
@Injectable()
export class WebPushNotifier implements Notifier<PushSubscription> {
  async send(target: PushSubscription, payload: NotifierPayload): Promise<void> {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 600 },
    );
  }
}
