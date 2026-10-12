import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type GoalHorizon = 'year' | 'quarter' | 'month';
export type GoalStatus = 'active' | 'done' | 'dropped';

@Entity('goal')
@Index('idx_goal_owner_horizon_start', ['ownerId', 'horizon', 'periodStart'])
@Index('idx_goal_parent', ['parentGoalId'])
export class Goal extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 16 })
  horizon!: GoalHorizon;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ name: 'parent_goal_id', type: 'bigint', nullable: true })
  parentGoalId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: GoalStatus;
}
