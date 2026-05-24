import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('gmail_message')
@Index('idx_gmail_message_account', ['gmailAccountId'])
@Index('idx_gmail_message_account_received', ['gmailAccountId', 'receivedAt'])
@Unique('uq_gmail_message_account_msg', ['gmailAccountId', 'gmailMessageId'])
export class GmailMessage extends BaseEntity {
  @Column({ name: 'gmail_account_id', type: 'bigint' })
  gmailAccountId!: string;

  @Column({ name: 'gmail_message_id', type: 'varchar', length: 64 })
  gmailMessageId!: string;

  @Column({ name: 'thread_id', type: 'varchar', length: 64, nullable: true })
  threadId!: string | null;

  @Column({ type: 'text', nullable: true })
  snippet!: string | null;

  @Column({ name: 'from_addr', type: 'varchar', length: 255, nullable: true })
  fromAddr!: string | null;

  @Column({ name: 'to_addr', type: 'varchar', length: 512, nullable: true })
  toAddr!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  subject!: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  unread!: boolean;

  @Column({ name: 'has_attachment', type: 'boolean', default: false })
  hasAttachment!: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  labels!: string | null;
}
