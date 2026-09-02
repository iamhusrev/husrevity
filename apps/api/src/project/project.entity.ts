import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * `(owner_id, code)` uniqueness is enforced only on live rows via the
 * partial index `uq_project_owner_code_live` (see migration
 * 1715000018000-PartialUniqueOnSoftDelete.ts), not an entity-level
 * `@Unique` — `synchronize` is always off, so this decorator would be
 * documentation only, and a plain `@Unique` here would misleadingly imply
 * a soft-deleted row still blocks reuse of its code (it doesn't).
 */
@Entity('project')
@Index('idx_project_owner', ['ownerId'])
@Index('idx_project_owner_archived', ['ownerId', 'archived'])
export class Project extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 64 })
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
