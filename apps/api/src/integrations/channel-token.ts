import { createHash, timingSafeEqual } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** New-model push channels use a UUID as channel id; legacy ones use `husrevity-gcal-<owner>-<ts>`. */
export function isChannelUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** SHA-256 hex of a channel token. Only this hash is ever stored; the raw token is never logged. */
export function hashChannelToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
