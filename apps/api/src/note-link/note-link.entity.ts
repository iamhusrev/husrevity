import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Note } from '../note/note.entity';

export type NoteLinkTargetType = 'item' | 'project' | 'goal';

@Entity('note_link')
@Index('idx_note_link_owner_target', ['ownerId', 'targetType', 'targetId'])
@Index('idx_note_link_note', ['noteId'])
export class NoteLink extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'note_id', type: 'bigint' })
  noteId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: NoteLinkTargetType;

  @Column({ name: 'target_id', type: 'bigint' })
  targetId!: string;

  @ManyToOne(() => Note, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note?: Relation<Note>;
}
