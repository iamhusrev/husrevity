import { ApiException } from '../common/api.exception';
import { redactSecrets } from './log-redaction';

/** Longest range the web calendar feed serves in one request. */
export const FEED_MAX_RANGE_DAYS = 100;

/** The broad grant of the legacy integration. Anything without it counts as narrowed. */
export const BROAD_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** The only scope that lets Husrevity write; it covers calendars the app created itself. */
export const CALENDAR_APP_CREATED_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

export type GoogleCalendarMode = 'legacy' | 'v2_read' | 'narrowed';

/** Parses and bounds the `from`/`to` query of the feed. Both are half-open instants [from, to). */
export function parseFeedRange(fromRaw: string, toRaw: string): { from: Date; to: Date } {
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiException.badRequest('from and to must be valid ISO 8601 dates');
  }
  if (to.getTime() <= from.getTime()) {
    throw ApiException.badRequest('to must be after from');
  }
  if (to.getTime() - from.getTime() > FEED_MAX_RANGE_DAYS * 86_400_000) {
    throw ApiException.badRequest(`The range must not exceed ${FEED_MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

/** legacy = flag off; narrowed = grants known and the broad scope is gone; v2_read otherwise. */
export function deriveMode(flagEnabled: boolean, grantedScopes: string[]): GoogleCalendarMode {
  if (!flagEnabled) return 'legacy';
  if (grantedScopes.length > 0 && !grantedScopes.includes(BROAD_CALENDAR_SCOPE)) return 'narrowed';
  return 'v2_read';
}

/** Error text that is safe to show to the user: credentials masked, bounded length. */
export function sanitizeLastError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = redactSecrets(raw).trim();
  return clean ? clean.slice(0, 200) : null;
}

/** After this many failed revoke attempts the retry record is dropped, the token deleted and a tombstone kept. */
export const MAX_REVOKE_ATTEMPTS = 5;

/**
 * SQL predicate (over `google_calendar_connection`) of the tombstone left when the
 * revoke retries were abandoned: disconnected, no retry pending, attempts used up.
 * It tells the user the Google grant may still be active. It is NOT a live
 * connection: the engine, feed, status, webhook and the "owner uses v2" helper all
 * ignore a `disconnected` row.
 */
export const REVOKE_FAILED_TOMBSTONE_SQL = `status = 'disconnected' AND revoke_pending_at IS NULL AND revoke_attempts >= ${MAX_REVOKE_ATTEMPTS}`;
