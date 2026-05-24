import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { NoteTag } from './note-tag.entity';

@Entity('note')
@Index('idx_note_owner', ['ownerId'])
@Index('idx_note_owner_archived', ['ownerId', 'archived'])
@Index('idx_note_owner_position', ['ownerId', 'position'])
export class Note extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'body_markdown', type: 'text', nullable: true })
  bodyMarkdown!: string | null;

  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'color_hex', type: 'varchar', length: 16, nullable: true })
  colorHex!: string | null;

  @ManyToMany(() => NoteTag, { eager: true })
  @JoinTable({
    name: 'note_tag_assignment',
    joinColumn: { name: 'note_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: NoteTag[];
}
