import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('todo_list')
@Index('idx_todo_list_owner', ['ownerId'])
@Index('idx_todo_list_owner_position', ['ownerId', 'position'])
export class TodoList extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon!: string | null;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
