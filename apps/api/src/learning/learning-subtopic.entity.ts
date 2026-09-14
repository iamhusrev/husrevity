import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('learning_subtopic')
@Index('idx_learning_subtopic_topic_position', ['topicId', 'position'])
export class LearningSubtopic extends BaseEntity {
  @Column({ name: 'topic_id', type: 'bigint' })
  topicId!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
