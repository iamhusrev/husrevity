import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * A single recurring activity inside a routine segment, e.g. "Kuran ve Cevşen"
 * under "Güne Hazırlık". These are the template agenda items; because the
 * routine repeats daily there is no per-day completion here (that lives in the
 * separate reading/habit tracker — see Faz 3).
 */
@Entity('routine_activity')
@Index('idx_routine_activity_segment_position', ['segmentId', 'position'])
export class RoutineActivity extends BaseEntity {
  @Column({ name: 'segment_id', type: 'bigint' })
  segmentId!: string;

  @Column({ type: 'varchar', length: 300 })
  text!: string;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
