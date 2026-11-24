import { Raw } from 'typeorm';

/**
 * `external_link` has no owner column; ownership is the owner of the linked
 * item. This filter limits a link lookup to links whose item belongs to
 * `ownerId`, so a Google event id shared between users (shared calendars)
 * can never resolve to another user's link. Soft-deleted items still count as
 * owned, so a stale link keeps resolving to its owner and is repaired.
 */
export function linkedItemOwnedBy(ownerId: string) {
  return Raw((alias) => `${alias} IN (SELECT i.id FROM items i WHERE i.owner_id = :linkOwnerId)`, {
    linkOwnerId: ownerId,
  });
}
