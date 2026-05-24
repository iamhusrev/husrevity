import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Persisted Web Push subscription. One row per (user, device).
 *
 * The `endpoint` URL plus the `p256dh`/`auth` keys are what
 * `webpush.sendNotification` needs. We store the user agent only for the
 * settings UI ("Chrome on macOS"). Soft-deleted rows are kept for audit
 * trail — the partial-unique index in migration 1715000009000 enforces
 * uniqueness only on live rows so a re-subscribed device can reuse an
 * endpoint that was previously marked as gone.
 */
@Entity('push_subscription')
@Index('idx_push_subscription_owner', ['ownerId'])
export class PushSubscription extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'text' })
  p256dh!: string;

  @Column({ type: 'text' })
  auth!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 256, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;
}
