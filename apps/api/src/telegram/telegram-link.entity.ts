import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type TelegramLinkStatus = 'pending' | 'linked' | 'unlinked';

@Entity('telegram_link')
@Index('idx_telegram_link_owner', ['ownerId'])
export class TelegramLink extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'chat_id', type: 'bigint', nullable: true })
  chatId!: string | null;

  @Column({ name: 'link_code', type: 'varchar', length: 64, nullable: true })
  linkCode!: string | null;

  @Column({ name: 'link_code_expires_at', type: 'timestamptz', nullable: true })
  linkCodeExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: TelegramLinkStatus;

  @Column({ name: 'linked_at', type: 'timestamptz', nullable: true })
  linkedAt!: Date | null;
}
