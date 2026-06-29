import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * One calendar day's entry for a {@link ReadingTrack}: the pages covered and
 * whether the day's reading was read and/or listened. At most one live row per
 * (track, date) — enforced by a partial unique index in the migration — and
 * upserted via `PUT /reading-tracks/:id/logs/:date`.
 */
@Entity('reading_log')
@Index('idx_reading_log_track_date', ['trackId', 'logDate'])
export class ReadingLog extends BaseEntity {
  @Column({ name: 'track_id', type: 'bigint' })
  trackId!: string;

  /** The calendar day this entry belongs to (date only, no time/zone). */
  @Column({ name: 'log_date', type: 'date' })
  logDate!: string;

  /** Pages covered that day, free-form, e.g. "1-10" or "152, 160". */
  @Column({ name: 'page_range', type: 'varchar', length: 120, nullable: true })
  pageRange!: string | null;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @Column({ type: 'boolean', default: false })
  listened!: boolean;
}
