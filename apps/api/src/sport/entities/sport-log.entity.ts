import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/**
 * An executed workout record, optionally linked back to the
 * {@link SportSession} it fulfills. Carries `ownerId` directly so history
 * can be queried without joining through `sport_session` / `sport_program`.
 */
@Entity('sport_log')
@Index('idx_sport_log_owner_date', ['ownerId', 'executedDate'])
export class SportLog extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'session_id', type: 'bigint', nullable: true })
  sessionId!: string | null; // FK to sport_session

  @Column({ name: 'executed_date', type: 'date' })
  executedDate!: string;

  @Column({ name: 'actual_duration', type: 'int' })
  actualDuration!: number; // minutes completed

  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @Column({ type: 'int', default: 5 })
  intensity!: number; // 1-10 scale

  @Column({ type: 'text', nullable: true })
  notes!: string | null; // how felt, modifications

  @Column({ name: 'calories_burned', type: 'int', nullable: true })
  caloriesBurned!: number | null;
}
