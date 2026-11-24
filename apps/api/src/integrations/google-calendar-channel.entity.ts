import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Push-notification channel. The id is the UUID sent to Google as the channel
 * id; the channel token is stored only as a SHA-256 hex hash.
 */
@Entity('google_calendar_channel')
export class GoogleCalendarChannel {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'subscription_id', type: 'bigint' })
  subscriptionId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 255, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true })
  stoppedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
