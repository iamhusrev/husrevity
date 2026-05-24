import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('plan')
@Index('idx_plan_owner', ['ownerId'])
export class Plan extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;
}
