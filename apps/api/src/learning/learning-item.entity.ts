import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('learning_item')
@Index('idx_learning_item_topic_position', ['topicId', 'position'])
@Index('idx_learning_item_subtopic_position', ['subtopicId', 'position'])
export class LearningItem extends BaseEntity {
  @Column({ name: 'topic_id', type: 'bigint' })
  topicId!: string;

  @Column({ name: 'subtopic_id', type: 'bigint', nullable: true })
  subtopicId!: string | null;

  @Column({ type: 'varchar', length: 300 })
  text!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  url!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'estimated_minutes', type: 'integer', nullable: true })
  estimatedMinutes!: number | null;

  @Column({ name: 'review_at', type: 'timestamptz', nullable: true })
  reviewAt!: Date | null;

  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
