import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('note_tag')
@Index('uq_note_tag_owner_name_live', ['ownerId', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class NoteTag extends BaseEntity {
  @Index('idx_note_tag_owner')
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color!: string | null;
}
