import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Source domain that emitted this notification. Kept as a string union so
 * adding a new source (e.g. plan items, project milestones) is a non-breaking
 * additive change.
 */
export type NotificationKind =
  | 'reminder'
  | 'task'
  | 'list_item'
  | 'calendar_event'
  | 'time_block'
  | 'debt';

/**
 * Unified notification queue + read log.
 *
 * - `scheduled_at`: when the dispatcher should fire it. For
 *   `notifyMinutesBefore = N`, this is `dueAt - N minutes`.
 * - `dispatched_at`: NULL until the cron sends the web-push payload.
 * - `read_at`: the user clicked it (or "Mark all read") in the bell dropdown.
 *
 * Idempotent enqueue: the partial unique index on
 * (owner_id, kind, source_id, scheduled_at) means re-enqueueing the same
 * trigger after a domain update is a no-op upsert, not a duplicate.
 */
@Entity('notification')
@Index('idx_notification_owner_scheduled', ['ownerId', 'scheduledAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: NotificationKind;

  @Column({ name: 'source_id', type: 'bigint', nullable: true })
  sourceId!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  body!: string | null;

  @Column({ name: 'deep_link', type: 'varchar', length: 256, nullable: true })
  deepLink!: string | null;
}
