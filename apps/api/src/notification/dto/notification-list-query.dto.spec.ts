import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NotificationListQueryDto } from './notification-dtos';

/**
 * Query strings arrive as text. `@Type(() => Boolean)` evaluates Boolean('false') === true, so
 * GET /notifications?unread=false used to return only unread notifications.
 */
describe('NotificationListQueryDto unread parsing', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const meta = { type: 'query' as const, metatype: NotificationListQueryDto };

  it("parses unread='true' as true", async () => {
    expect((await pipe.transform({ unread: 'true' }, meta)).unread).toBe(true);
  });

  it("parses unread='false' as false, not true", async () => {
    expect((await pipe.transform({ unread: 'false' }, meta)).unread).toBe(false);
  });

  it('leaves unread undefined when it is not sent', async () => {
    expect((await pipe.transform({}, meta)).unread).toBeUndefined();
  });

  it('rejects a value that is neither true nor false', async () => {
    await expect(pipe.transform({ unread: 'maybe' }, meta)).rejects.toBeDefined();
  });

  it('still parses limit as a number', async () => {
    expect((await pipe.transform({ limit: '25' }, meta)).limit).toBe(25);
  });
});
