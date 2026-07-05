import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('project')
@Index('idx_project_owner', ['ownerId'])
@Index('idx_project_owner_archived', ['ownerId', 'archived'])
@Unique('uq_project_owner_code', ['ownerId', 'code'])
export class Project extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;
}
