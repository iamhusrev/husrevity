import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('plan_item')
@Index('idx_plan_item_plan', ['planId'])
@Index('idx_plan_item_plan_order', ['planId', 'orderIndex'])
export class PlanItem extends BaseEntity {
  @Column({ name: 'plan_id', type: 'bigint' })
  planId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate!: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex!: number;
}
