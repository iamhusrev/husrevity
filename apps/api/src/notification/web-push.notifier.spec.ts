import * as webpush from 'web-push';
import { WebPushNotifier } from './web-push.notifier';
import { PushSubscription } from './push-subscription.entity';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

describe('WebPushNotifier', () => {
  it('forwards the subscription and JSON-stringified payload to web-push.sendNotification', async () => {
    const notifier = new WebPushNotifier();
    const sub = { endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' } as PushSubscription;
    const payload = { id: '1', title: 'T', body: 'B', deepLink: '/x', kind: 'task' };

    await notifier.send(sub, payload);

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(payload),
      { TTL: 600 },
    );
  });

  it('propagates a failure from web-push.sendNotification (caller decides retry/drop)', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    );
    const notifier = new WebPushNotifier();
    const sub = { endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' } as PushSubscription;

    await expect(
      notifier.send(sub, { id: '1', title: 'T', body: 'B', deepLink: '/x', kind: 'task' }),
    ).rejects.toThrow('Gone');
  });
});
