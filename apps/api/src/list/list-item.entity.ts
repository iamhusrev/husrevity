import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('list_item')
@Index('idx_list_item_list', ['listId'])
@Index('idx_list_item_list_position', ['listId', 'position'])
export class ListItem extends BaseEntity {
  @Column({ name: 'list_id', type: 'bigint' })
  listId!: string;

  @Column({ type: 'varchar', length: 512 })
  text!: string;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  /** Notification lead-time in minutes (NULL = no notification). */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;
}
