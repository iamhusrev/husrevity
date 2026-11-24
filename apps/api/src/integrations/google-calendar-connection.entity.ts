import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type GoogleCalendarConnectionStatus = 'active' | 'needs_reconnect' | 'disconnected';

/**
 * One row per owner. Tokens are NOT stored here: `integrationAccountId` points
 * at the existing `integration_account` row, which keeps the encrypted tokens.
 */
@Entity('google_calendar_connection')
export class GoogleCalendarConnection {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'integration_account_id', type: 'bigint', nullable: true })
  integrationAccountId!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status!: GoogleCalendarConnectionStatus;

  @Column({ name: 'granted_scopes', type: 'jsonb', default: '[]' })
  grantedScopes!: string[];

  @Column({ name: 'last_error', type: 'varchar', length: 255, nullable: true })
  lastError!: string | null;

  /** Optional write-back to Google. Off until the user opts in (needs `calendar.app.created`). */
  @Column({ name: 'write_enabled', type: 'boolean', default: false })
  writeEnabled!: boolean;

  /** Set when a disconnect could not revoke the Google token yet; a worker retries. */
  @Column({ name: 'revoke_pending_at', type: 'timestamptz', nullable: true })
  revokePendingAt!: Date | null;

  @Column({ name: 'revoke_attempts', type: 'int', default: 0 })
  revokeAttempts!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
