import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One row per owner + Google calendar. Concurrency invariants (see
 * GoogleCalendarReadSyncService for the code):
 *  - `epoch` only grows. It is bumped when a lease is acquired and when the
 *    subscription is fenced (deselect). A writer holds the epoch it got at
 *    acquire time and every write transaction re-checks it under a row lock.
 *  - Event rows are visible only for `activeGeneration`.
 */
@Entity('google_calendar_subscription')
export class GoogleCalendarSubscription {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'connection_id', type: 'bigint' })
  connectionId!: string;

  @Column({ name: 'google_calendar_id', type: 'varchar', length: 255 })
  googleCalendarId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  summary!: string | null;

  /** The app-created calendar Husrevity publishes into. Never selectable, never read back. */
  @Column({ type: 'boolean', default: false })
  managed!: boolean;

  @Column({ type: 'boolean', default: false })
  selected!: boolean;

  @Column({ name: 'sync_token', type: 'text', nullable: true })
  syncToken!: string | null;

  @Column({ type: 'int', default: 0 })
  epoch!: number;

  @Column({ name: 'lease_holder', type: 'varchar', length: 64, nullable: true })
  leaseHolder!: string | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'needs_sync_at', type: 'timestamptz', nullable: true })
  needsSyncAt!: Date | null;

  @Column({ name: 'active_generation', type: 'int', default: 0 })
  activeGeneration!: number;

  @Column({ name: 'building_generation', type: 'int', nullable: true })
  buildingGeneration!: number | null;

  @Column({ name: 'window_min', type: 'timestamptz', nullable: true })
  windowMin!: Date | null;

  @Column({ name: 'window_max', type: 'timestamptz', nullable: true })
  windowMax!: Date | null;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt!: Date | null;

  @Column({ name: 'last_full_sync_at', type: 'timestamptz', nullable: true })
  lastFullSyncAt!: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 255, nullable: true })
  lastError!: string | null;

  /** Failed syncs in a row; drives the exponential backoff. Reset by a success. */
  @Column({ name: 'consecutive_failures', type: 'int', default: 0 })
  consecutiveFailures!: number;

  /** The worker skips the subscription until this instant. Null when not backing off. */
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
