import { TelegramLink, TelegramLinkStatus } from './telegram-link.entity';

describe('TelegramLink Entity', () => {
  it('should instantiate correctly with required and optional fields', () => {
    const link = new TelegramLink();
    link.ownerId = '42';
    link.chatId = '987654321';
    link.linkCode = '123456';
    link.linkCodeExpiresAt = new Date('2026-09-28T22:00:00Z');
    link.status = 'pending' as TelegramLinkStatus;
    link.linkedAt = null;

    expect(link.ownerId).toBe('42');
    expect(link.chatId).toBe('987654321');
    expect(link.linkCode).toBe('123456');
    expect(link.linkCodeExpiresAt).toEqual(new Date('2026-09-28T22:00:00Z'));
    expect(link.status).toBe('pending');
    expect(link.linkedAt).toBeNull();
  });

  it('should support linked state', () => {
    const link = new TelegramLink();
    link.ownerId = '42';
    link.chatId = '987654321';
    link.status = 'linked';
    link.linkedAt = new Date('2026-09-28T21:30:00Z');

    expect(link.status).toBe('linked');
    expect(link.linkedAt).toBeDefined();
  });
});
