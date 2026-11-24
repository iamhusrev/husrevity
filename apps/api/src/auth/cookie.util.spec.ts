import { parseCookieHeader } from './cookie.util';

describe('parseCookieHeader', () => {
  it('returns an empty object for missing or empty headers', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('parses several cookies and trims whitespace', () => {
    expect(parseCookieHeader('a=1;  b=2 ; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('keeps "=" inside values', () => {
    expect(parseCookieHeader('t=abc==; x=y')).toEqual({ t: 'abc==', x: 'y' });
  });

  it('strips surrounding double quotes and decodes percent-encoding', () => {
    expect(parseCookieHeader('a="hello%20world"')).toEqual({ a: 'hello world' });
  });

  it('keeps the raw value when percent-encoding is invalid', () => {
    expect(parseCookieHeader('a=%E0%A4%A')).toEqual({ a: '%E0%A4%A' });
  });

  it('skips pairs without "=" or with an empty name', () => {
    expect(parseCookieHeader('junk; =novalue; ok=1')).toEqual({ ok: '1' });
  });

  it('lets the first occurrence of a duplicate name win', () => {
    expect(parseCookieHeader('a=first; a=second')).toEqual({ a: 'first' });
  });

  it('does not allow prototype pollution through cookie names', () => {
    const parsed = parseCookieHeader('__proto__=x; constructor=y');
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
