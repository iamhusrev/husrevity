import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type SlackLinkStatus = 'pending' | 'linked' | 'unlinked';

@Entity('slack_link')
@Index('idx_slack_link_owner', ['ownerId'])
export class SlackLink extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'slack_user_id', type: 'varchar', length: 32, nullable: true })
  slackUserId!: string | null;

  @Column({ name: 'link_code', type: 'varchar', length: 64, nullable: true })
  linkCode!: string | null;

  @Column({ name: 'link_code_expires_at', type: 'timestamptz', nullable: true })
  linkCodeExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: SlackLinkStatus;

  @Column({ name: 'linked_at', type: 'timestamptz', nullable: true })
  linkedAt!: Date | null;
}
