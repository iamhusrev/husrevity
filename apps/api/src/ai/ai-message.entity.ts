import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('ai_message')
@Index('idx_ai_message_owner', ['ownerId'])
@Index('idx_ai_message_conversation', ['conversationId'])
export class AiMessage extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'conversation_id', type: 'bigint' })
  conversationId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: 'user' | 'model';

  @Column({ type: 'text' })
  content!: string;
}
