import { ExternalLink, ExternalLinkProvider } from './external-link.entity';

describe('ExternalLink Entity', () => {
  it('should instantiate correctly with required fields', () => {
    const link = new ExternalLink();
    link.itemId = '100';
    link.provider = 'google_calendar' as ExternalLinkProvider;
    link.externalId = 'google-event-abc123';
    link.etag = '"etag-xyz"';
    link.lastSyncedAt = new Date('2026-09-28T12:00:00Z');

    expect(link.itemId).toBe('100');
    expect(link.provider).toBe('google_calendar');
    expect(link.externalId).toBe('google-event-abc123');
    expect(link.etag).toBe('"etag-xyz"');
    expect(link.lastSyncedAt).toEqual(new Date('2026-09-28T12:00:00Z'));
  });
});
