import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/**
 * A multi-week sport program (hand-built or AI-generated) that groups
 * {@link SportSession} rows into a repeatable weekly/monthly schedule.
 */
@Entity('sport_program')
@Index('idx_sport_program_owner', ['ownerId'])
export class SportProgram extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'week_count', type: 'int' })
  weekCount!: number; // 4, 8, 12, etc

  @Column({ name: 'program_type', type: 'varchar', length: 50, default: 'WEEKLY' })
  programType!: string; // 'WEEKLY' | 'MONTHLY'

  @Column({ name: 'ai_generated', type: 'boolean', default: false })
  aiGenerated!: boolean; // true if created by AI

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
