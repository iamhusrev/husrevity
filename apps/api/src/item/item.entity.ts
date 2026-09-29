import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type ItemKind = 'task' | 'event' | 'log';
export type ItemStatus = 'open' | 'done' | 'cancelled';
export type ItemSource = 'web' | 'ios' | 'mcp' | 'telegram' | 'gmail' | 'gcal' | 'slack';

/**
 * The unified Item model (Faz 1 of the Husrevity simplification plan — see
 * docs/inventory.md). Absorbs task/reminder/calendar_event/routine/
 * time_block/learning_item/sport_session/sport_log; those tables stay live
 * and readable until a later phase drops them.
 *
 * `rrule` is the single source of truth for "this recurs" — there is
 * deliberately no separate `kind: 'habit'`, since a habit is just a task
 * with an rrule and a second, independent taxonomy would recreate the
 * badge/source mismatch fixed elsewhere in this same pass.
 *
 * `legacyTable`/`legacyId` are only set by the backfill migration, for
 * idempotency (see uq_items_legacy_source) — items created through the API
 * leave both null.
 */
@Entity('items')
@Index('idx_items_owner', ['ownerId'])
@Index('idx_items_project', ['projectId'])
@Index('idx_items_block', ['blockId'])
export class Item extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: ItemKind;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  context!: string | null;

  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId!: string | null;

  /** Parent item this one belongs to (e.g. a routine activity's segment). */
  @Column({ name: 'block_id', type: 'bigint', nullable: true })
  blockId!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'duration_min', type: 'integer', nullable: true })
  durationMin!: number | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;

  /** Bare RFC5545 RRULE value (e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR"), no DTSTART/prefix — scheduledAt plays the DTSTART role. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  rrule!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: ItemStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'web' })
  source!: ItemSource;

  @Column({ name: 'legacy_table', type: 'varchar', length: 32, nullable: true })
  legacyTable!: string | null;

  @Column({ name: 'legacy_id', type: 'bigint', nullable: true })
  legacyId!: string | null;
}
