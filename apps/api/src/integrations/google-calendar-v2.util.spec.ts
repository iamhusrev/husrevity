import { ApiException } from '../common/api.exception';
import {
  FEED_MAX_RANGE_DAYS,
  deriveMode,
  parseFeedRange,
  sanitizeLastError,
} from './google-calendar-v2.util';

describe('google-calendar-v2.util', () => {
  describe('parseFeedRange', () => {
    it('parses an ISO range into dates', () => {
      const r = parseFeedRange('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z');
      expect(r.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(r.to.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('accepts a range of exactly the maximum length', () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const to = new Date(from.getTime() + FEED_MAX_RANGE_DAYS * 86_400_000);
      expect(() => parseFeedRange(from.toISOString(), to.toISOString())).not.toThrow();
    });

    it.each([
      ['an empty range', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'],
      ['an inverted range', '2026-07-01T00:00:00Z', '2026-06-01T00:00:00Z'],
      ['a range over the maximum', '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z'],
      ['an unparsable from', 'nope', '2026-06-01T00:00:00Z'],
      ['an unparsable to', '2026-06-01T00:00:00Z', 'nope'],
    ])('rejects %s with a bad request', (_label, from, to) => {
      expect(() => parseFeedRange(from, to)).toThrow(ApiException);
      try {
        parseFeedRange(from, to);
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(400);
      }
    });
  });

  describe('deriveMode', () => {
    it('is legacy while the flag is off', () => {
      expect(deriveMode(false, ['https://www.googleapis.com/auth/calendar.events.readonly'])).toBe('legacy');
    });
    it('is v2_read with the flag on and the broad legacy grant', () => {
      expect(deriveMode(true, ['https://www.googleapis.com/auth/calendar'])).toBe('v2_read');
    });
    it('is v2_read with the flag on and no known grant', () => {
      expect(deriveMode(true, [])).toBe('v2_read');
    });
    it('is narrowed when grants exist and none is the broad calendar scope', () => {
      expect(
        deriveMode(true, [
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events.readonly',
        ]),
      ).toBe('narrowed');
    });
  });

  describe('sanitizeLastError', () => {
    it('returns null for empty input', () => {
      expect(sanitizeLastError(null)).toBeNull();
      expect(sanitizeLastError('')).toBeNull();
    });
    it('keeps short stable codes as they are', () => {
      expect(sanitizeLastError('google_500')).toBe('google_500');
    });
    it('masks credential-looking text and bounds the length', () => {
      const out = sanitizeLastError(`failed with Bearer abc.def.ghi-123 ${'x'.repeat(500)}`)!;
      expect(out).not.toContain('abc.def.ghi-123');
      expect(out.length).toBeLessThanOrEqual(200);
    });
  });
});
