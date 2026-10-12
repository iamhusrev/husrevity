import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { ChangeEntry } from './change-entry.entity';

export type ChangeSetSource = 'mcp' | 'web' | 'telegram' | 'slack' | 'system';
export type ChangeSetStatus = 'applied' | 'undone' | 'partially_undone';

@Entity('change_set')
@Index('idx_change_set_owner_created', ['ownerId', 'createdAt'])
export class ChangeSet extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: ChangeSetSource;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'varchar', length: 24, default: 'applied' })
  status!: ChangeSetStatus;

  @Column({ name: 'undone_at', type: 'timestamptz', nullable: true })
  undoneAt!: Date | null;

  @OneToMany(() => ChangeEntry, (e) => e.changeSet)
  entries?: ChangeEntry[];
}
