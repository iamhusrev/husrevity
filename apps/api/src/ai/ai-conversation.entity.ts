import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('ai_conversation')
@Index('idx_ai_conversation_owner', ['ownerId'])
export class AiConversation extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;
}
