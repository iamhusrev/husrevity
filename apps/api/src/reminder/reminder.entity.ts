import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('reminder')
@Index('idx_reminder_owner', ['ownerId'])
@Index('idx_reminder_list', ['listId'])
@Index('idx_reminder_owner_due', ['ownerId', 'dueAt'])
export class Reminder extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'list_id', type: 'bigint', nullable: true })
  listId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'NONE' })
  priority!: string;

  @Column({ type: 'boolean', default: false })
  flag!: boolean;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  /**
   * Minutes before {@link dueAt} that the notification dispatcher should fire.
   * NULL = no notification. 0 = at dueAt exactly.
   * Mirrors {@link CalendarEvent.reminderMinutes} but on a more general column
   * name shared across reminder/task/list_item/time_block.
   */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;
}
