import { ExpoPushNotifier } from './expo-push.notifier';
import { Device } from './device.entity';
import { NotifierPayload } from '../notification/notifier.interface';

describe('ExpoPushNotifier', () => {
  let notifier: ExpoPushNotifier;
  const originalFetch = global.fetch;

  beforeEach(() => {
    notifier = new ExpoPushNotifier();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockPayload: NotifierPayload = {
    id: 'notif-1',
    title: 'Task Reminder',
    body: 'Complete phase 8',
    deepLink: '/today',
    kind: 'task',
  };

  const mockDevice: Device = {
    id: 'dev-1',
    ownerId: 'user-1',
    platform: 'ios',
    pushToken: 'ExponentPushToken[xxxxxx]',
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Device;

  it('sends push payload to Expo Push API successfully', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [{ status: 'ok', id: 'ticket-1' }],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(notifier.send(mockDevice, mockPayload)).resolves.not.toThrow();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          to: 'ExponentPushToken[xxxxxx]',
          sound: 'default',
          title: 'Task Reminder',
          body: 'Complete phase 8',
          data: {
            id: 'notif-1',
            deepLink: '/today',
            kind: 'task',
          },
        }),
      }),
    );
  });

  it('skips non-mobile devices', async () => {
    const webDevice = { ...mockDevice, platform: 'web' } as Device;
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await notifier.send(webDevice, mockPayload);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws error when API returns non-2xx status', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(notifier.send(mockDevice, mockPayload)).rejects.toThrow(
      'Expo push API returned status 500 Internal Server Error',
    );
  });

  it('throws error when ticket status is error', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [{ status: 'error', message: 'DeviceNotRegistered' }],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(notifier.send(mockDevice, mockPayload)).rejects.toThrow(
      'Expo push ticket error: DeviceNotRegistered',
    );
  });
});
