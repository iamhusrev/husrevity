import { ApiException } from '../common/api.exception';

export interface PositionedRow {
  id: string;
  position: number;
}

export interface PositionChange {
  id: string;
  position: number;
  from: number;
}

/**
 * Throws 400 unless `orderedIds` is exactly the set `currentIds`:
 * no missing, extra or duplicated id. Call this before writing anything.
 */
export function assertExactSet(currentIds: string[], orderedIds: string[]): void {
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length) {
    throw ApiException.badRequest('orderedIds contains duplicate ids');
  }
  if (orderedIds.length !== currentIds.length || currentIds.some((id) => !unique.has(id))) {
    throw ApiException.badRequest('orderedIds must contain exactly the ids of the current list');
  }
}

/**
 * Plans position = 0..n-1 for `orderedIds`. Only rows whose stored position
 * differs are returned, so a no-op reorder writes nothing.
 */
export function planRenumber(rows: PositionedRow[], orderedIds: string[]): PositionChange[] {
  const current = new Map(rows.map((r) => [r.id, r.position]));
  const changes: PositionChange[] = [];
  orderedIds.forEach((id, index) => {
    const from = current.get(id);
    if (from !== undefined && from !== index) changes.push({ id, position: index, from });
  });
  return changes;
}

/**
 * Refills the slots that `subsetIds` occupy in `globalOrder` with
 * `orderedSubset`, leaving every other id where it is.
 */
export function fillSlots(
  globalOrder: string[],
  subsetIds: string[],
  orderedSubset: string[],
): string[] {
  const subset = new Set(subsetIds);
  let next = 0;
  return globalOrder.map((id) => (subset.has(id) ? orderedSubset[next++] : id));
}

/** Returns a copy of `list` with `id` inserted at `index` (clamped to the list bounds). */
export function insertAt(list: string[], id: string, index: number): string[] {
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), id, ...list.slice(at)];
}
