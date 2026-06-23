import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Evkat — a named segment of the user's fixed daily routine. Unlike the old
 * per-date `time_block`, a routine segment is a *template* that repeats every
 * day (e.g. "Güne Hazırlık" 06:00–08:00, "Mobiliz" 09:00–14:00). It carries an
 * ordered set of recurring activities (see `routine_activity`).
 *
 * Times are stored as minutes-from-midnight (0–1439) so the segment is free of
 * any specific calendar date. Both bounds are nullable to allow open-ended
 * slots like "Öncesi — 08:00".
 */
@Entity('routine_segment')
@Index('idx_routine_segment_owner_position', ['ownerId', 'position'])
export class RoutineSegment extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Minutes from midnight (0–1439); null = open start ("before X"). */
  @Column({ name: 'start_minute', type: 'integer', nullable: true })
  startMinute!: number | null;

  /** Minutes from midnight (0–1439); null = open end. */
  @Column({ name: 'end_minute', type: 'integer', nullable: true })
  endMinute!: number | null;

  /** Short theme tag, e.g. "Kendini Geliştirme". Free-form. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  theme!: string | null;

  /** Husrev token name (e.g. `husrev-amber`) for the segment accent color. */
  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
