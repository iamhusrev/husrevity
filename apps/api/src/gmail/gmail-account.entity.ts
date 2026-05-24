import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('gmail_account')
@Index('idx_gmail_account_owner', ['ownerId'])
@Index('uq_gmail_account_owner_email_provider', ['ownerId', 'email', 'provider'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class GmailAccount extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 16, default: 'google' })
  provider!: 'google' | 'microsoft';

  @Column({ type: 'varchar', length: 160 })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 160, nullable: true })
  displayName!: string | null;

  @Column({ name: 'access_token_enc', type: 'text' })
  accessTokenEnc!: string;

  @Column({ name: 'refresh_token_enc', type: 'text', nullable: true })
  refreshTokenEnc!: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  scopes!: string | null;

  @Column({ name: 'history_id', type: 'varchar', length: 64, nullable: true })
  historyId!: string | null;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt!: Date | null;
}
