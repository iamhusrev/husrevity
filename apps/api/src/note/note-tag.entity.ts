import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('note_tag')
@Unique('uq_note_tag_owner_name', ['ownerId', 'name'])
export class NoteTag extends BaseEntity {
  @Index('idx_note_tag_owner')
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color!: string | null;
}
