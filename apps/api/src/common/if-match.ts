import { ApiException } from './api.exception';

/**
 * Optimistic-concurrency helpers shared by every write endpoint an offline
 * client replays. The `If-Match` header carries the resource's `updatedAt`
 * as epoch milliseconds, exactly as the client last saw it in a response or
 * a sync payload.
 */

/** Parses an `If-Match` header; `undefined` means "write unconditionally". */
export function parseIfMatch(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  const raw = header.trim().replace(/^W\//, '').replace(/"/g, '');
  if (raw === '') return undefined;
  if (!/^\d+$/.test(raw)) {
    throw ApiException.badRequest('If-Match must be the resource updatedAt as epoch milliseconds');
  }
  return Number(raw);
}

/** Rejects with 409 if the resource changed since the caller last fetched it. */
export function assertIfMatch(updatedAt: Date, ifMatchMs: number | undefined, label: string): void {
  if (ifMatchMs === undefined) return;
  if (updatedAt.getTime() !== ifMatchMs) {
    throw ApiException.conflict(
      `${label} has been modified since you last fetched it (current updatedAt: ${updatedAt.toISOString()})`,
    );
  }
}
