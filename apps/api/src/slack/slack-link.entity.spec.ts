import { SlackLink, SlackLinkStatus } from './slack-link.entity';

describe('SlackLink Entity', () => {
  it('should instantiate correctly with required and optional fields', () => {
    const link = new SlackLink();
    link.ownerId = '42';
    link.slackUserId = 'U12345678';
    link.linkCode = 'abcdef';
    link.linkCodeExpiresAt = new Date('2026-09-29T00:00:00Z');
    link.status = 'pending' as SlackLinkStatus;
    link.linkedAt = null;

    expect(link.ownerId).toBe('42');
    expect(link.slackUserId).toBe('U12345678');
    expect(link.linkCode).toBe('abcdef');
    expect(link.linkCodeExpiresAt).toEqual(new Date('2026-09-29T00:00:00Z'));
    expect(link.status).toBe('pending');
    expect(link.linkedAt).toBeNull();
  });

  it('should support linked state', () => {
    const link = new SlackLink();
    link.ownerId = '42';
    link.slackUserId = 'U12345678';
    link.status = 'linked';
    link.linkedAt = new Date('2026-09-29T00:30:00Z');

    expect(link.status).toBe('linked');
    expect(link.linkedAt).toBeDefined();
  });
});
