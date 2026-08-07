import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('task')
@Index('idx_task_owner', ['ownerId'])
@Index('idx_task_project', ['projectId'])
@Index('idx_task_project_position', ['projectId', 'position'])
@Index('idx_task_assignee', ['assigneeId'])
export class Task extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'project_id', type: 'bigint', nullable: true })
  projectId!: string | null;

  @Column({ name: 'assignee_id', type: 'bigint', nullable: true })
  assigneeId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'TODO' })
  status!: string;

  @Column({ type: 'varchar', length: 32, default: 'MEDIUM' })
  priority!: string;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  /** Notification lead-time in minutes (NULL = no notification). */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;
}
