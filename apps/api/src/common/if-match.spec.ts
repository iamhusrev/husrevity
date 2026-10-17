import { assertIfMatch, parseIfMatch } from './if-match';
import { ApiException } from './api.exception';

describe('parseIfMatch', () => {
  it('returns undefined when the header is absent or blank', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(parseIfMatch('')).toBeUndefined();
    expect(parseIfMatch('   ')).toBeUndefined();
  });

  it('parses epoch milliseconds, with or without ETag quoting', () => {
    expect(parseIfMatch('1767225600000')).toBe(1767225600000);
    expect(parseIfMatch('"1767225600000"')).toBe(1767225600000);
    expect(parseIfMatch('W/"1767225600000"')).toBe(1767225600000);
  });

  it.each(['abc', '12.5', '-3', '1e9', '"12 34"'])('rejects %p with 400', (bad) => {
    expect(() => parseIfMatch(bad)).toThrow(ApiException);
    try {
      parseIfMatch(bad);
    } catch (e) {
      expect((e as ApiException).getStatus()).toBe(400);
    }
  });
});

describe('assertIfMatch', () => {
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');

  it('passes when the header is absent (unconditional write)', () => {
    expect(() => assertIfMatch(updatedAt, undefined, 'Note')).not.toThrow();
  });

  it('passes when the header equals the current updatedAt', () => {
    expect(() => assertIfMatch(updatedAt, updatedAt.getTime(), 'Note')).not.toThrow();
  });

  it('throws 409 naming the resource and the current updatedAt when stale', () => {
    let error: ApiException | undefined;
    try {
      assertIfMatch(updatedAt, updatedAt.getTime() - 1, 'Note');
    } catch (e) {
      error = e as ApiException;
    }
    expect(error).toBeInstanceOf(ApiException);
    expect(error!.getStatus()).toBe(409);
    expect(error!.message).toContain('Note has been modified');
    expect(error!.message).toContain('2026-01-01T00:00:00.000Z');
  });
});
