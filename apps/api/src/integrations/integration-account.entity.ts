import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type IntegrationProvider = 'google_calendar';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

@Entity('integration_account')
@Index('idx_integration_account_owner', ['ownerId'])
export class IntegrationAccount extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: IntegrationProvider;

  @Column({ name: 'encrypted_access_token', type: 'text' })
  encryptedAccessToken!: string;

  @Column({ name: 'encrypted_refresh_token', type: 'text', nullable: true })
  encryptedRefreshToken!: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  scopes!: string[];

  @Column({ type: 'varchar', length: 32, default: 'connected' })
  status!: IntegrationStatus;

  @Column({ name: 'sync_token', type: 'text', nullable: true })
  syncToken!: string | null;

  @Column({ name: 'calendar_id', type: 'varchar', length: 255, nullable: true })
  calendarId!: string | null;

  @Column({ name: 'channel_id', type: 'varchar', length: 255, nullable: true })
  channelId!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 255, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'channel_expiration', type: 'timestamptz', nullable: true })
  channelExpiration!: Date | null;

  @Column({ name: 'channel_token', type: 'varchar', length: 255, nullable: true })
  channelToken!: string | null;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt!: Date;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt!: Date | null;
}
