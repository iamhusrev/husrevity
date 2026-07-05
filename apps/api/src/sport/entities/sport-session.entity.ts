import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/**
 * A single planned activity slot within a {@link SportProgram}, scheduled on
 * a given day of the week. Ownership is derived through `programId` (no
 * direct `ownerId` column, mirroring how `list_item` hangs off `list`).
 */
@Entity('sport_session')
@Index('idx_sport_session_program', ['programId'])
export class SportSession extends BaseEntity {
  @Column({ name: 'program_id', type: 'bigint', nullable: true })
  programId!: string | null; // FK to sport_program

  @Column({ name: 'activity_type', type: 'varchar', length: 50 })
  activityType!: string; // 'RUNNING' | 'YOGA' | 'SWIMMING' | 'STRENGTH' | 'GYM' | 'CYCLING' | 'FOOTBALL' | 'CUSTOM'

  @Column({ type: 'varchar', length: 50 })
  location!: string; // 'EV' | 'SALON' | 'YÜZME' | 'DIS'

  @Column({ type: 'varchar', length: 120 })
  name!: string; // e.g. "Morning Run"

  @Column({ name: 'planned_day_of_week', type: 'int', default: 0 })
  plannedDayOfWeek!: number; // 0-6, Monday-Sunday

  @Column({ name: 'planned_duration', type: 'int' })
  plannedDuration!: number; // minutes

  @Column({ type: 'varchar', length: 50, default: 'MODERATE' })
  difficulty!: string; // 'EASY' | 'MODERATE' | 'HARD'

  @Column({ type: 'text' })
  description!: string; // what to do

  @Column({ type: 'int', default: 0 })
  position!: number; // order within program
}
