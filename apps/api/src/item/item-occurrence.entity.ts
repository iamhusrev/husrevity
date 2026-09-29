import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type ItemOccurrenceStatus = 'done' | 'skipped';

/**
 * Sparse per-date completion override for a recurring item (one with a
 * non-null `rrule`, or one whose `blockId` points at such an item). A row
 * only exists when a date deviates from the implicit default "open" state
 * — there is no pre-materialization of future occurrences.
 *
 * `occursOn` is the item's local (Europe/Istanbul) calendar date, not an
 * instant — see item-recurrence.service.ts for how a date + the item's
 * time-of-day become a concrete UTC instant.
 */
@Entity('item_occurrences')
@Index('idx_item_occurrences_owner_date', ['ownerId', 'occursOn'])
export class ItemOccurrence extends BaseEntity {
  @Column({ name: 'item_id', type: 'bigint' })
  itemId!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'occurs_on', type: 'date' })
  occursOn!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: ItemOccurrenceStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
