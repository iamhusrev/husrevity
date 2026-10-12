import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ChangeSet } from './change-set.entity';

export type ChangeEntryTargetType = 'item' | 'item_occurrence';
export type ChangeEntryOp = 'create' | 'update' | 'delete' | 'complete';

@Entity('change_entry')
@Index('idx_change_entry_set_ordinal', ['changeSetId', 'ordinal'])
@Index('idx_change_entry_set', ['changeSetId'])
@Index('idx_change_entry_owner', ['ownerId'])
export class ChangeEntry {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'change_set_id', type: 'bigint' })
  changeSetId!: string;

  @ManyToOne(() => ChangeSet, (cs) => cs.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'change_set_id' })
  changeSet?: Relation<ChangeSet>;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'integer' })
  ordinal!: number;

  @Column({ name: 'target_type', type: 'varchar', length: 24 })
  targetType!: ChangeEntryTargetType;

  @Column({ name: 'target_id', type: 'bigint' })
  targetId!: string;

  @Column({ type: 'varchar', length: 16 })
  op!: ChangeEntryOp;

  @Column({ type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;

  @Column({ name: 'undone_at', type: 'timestamptz', nullable: true })
  undoneAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
