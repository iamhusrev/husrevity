import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * A named sub-heading inside a list (e.g. "İslam İlimleri" → Kelam/Fıkıh/...).
 * Lets a single list hold several grouped columns the way the owner's planning
 * spreadsheets do. Items reference a section via `list_item.section_id`
 * (NULL = ungrouped). Deleting a section ungroups its items, it never deletes
 * them.
 */
@Entity('list_section')
@Index('idx_list_section_list', ['listId'])
@Index('idx_list_section_list_position', ['listId', 'position'])
export class ListSection extends BaseEntity {
  @Column({ name: 'list_id', type: 'bigint' })
  listId!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
