import { NotificationService } from './notification.service';
import { ApiException } from '../common/api.exception';

describe('NotificationService.get', () => {
  const ownerId = '1';
  const hour = 60 * 60_000;
  let notifications: { findOne: jest.Mock };
  let service: NotificationService;

  const row = (over: Record<string, unknown>) => ({
    id: '6',
    ownerId,
    kind: 'reminder',
    sourceId: '2',
    title: 'Pay rent',
    body: null,
    deepLink: '/reminders',
    readAt: null,
    dispatchedAt: null,
    scheduledAt: new Date(Date.now() - hour),
    createdAt: new Date(),
    ...over,
  });

  beforeEach(() => {
    notifications = { findOne: jest.fn() };
    service = new NotificationService(notifications as never, {} as never, {} as never);
  });

  it('returns an owner-scoped notification that was already dispatched', async () => {
    notifications.findOne.mockResolvedValueOnce(
      row({ dispatchedAt: new Date(), scheduledAt: new Date(Date.now() + hour) }),
    );

    const result = await service.get(ownerId, '6');

    expect(notifications.findOne).toHaveBeenCalledWith({ where: { id: '6', ownerId } });
    expect(result).toMatchObject({ id: '6', title: 'Pay rent' });
  });

  it('returns one that is due even if it was not dispatched yet', async () => {
    notifications.findOne.mockResolvedValueOnce(row({}));

    await expect(service.get(ownerId, '6')).resolves.toMatchObject({ id: '6' });
  });

  it('hides a notification that is neither dispatched nor due (same rule as the list)', async () => {
    notifications.findOne.mockResolvedValueOnce(row({ scheduledAt: new Date(Date.now() + hour) }));

    await expect(service.get(ownerId, '6')).rejects.toBeInstanceOf(ApiException);
  });

  it('throws notFound for a missing or foreign notification', async () => {
    notifications.findOne.mockResolvedValueOnce(null);

    await expect(service.get(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
  });
});
