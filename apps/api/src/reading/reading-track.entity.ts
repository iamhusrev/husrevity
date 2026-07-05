import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Okumalar — a recurring daily reading/habit the owner tracks (e.g. "Kur'an",
 * "Cevşen", "Risale-i Nur"). A track is just the *definition*; the per-day
 * completion lives in {@link ReadingLog}. This is the habit-tracker counterpart
 * to the Evkat routine template: where a routine activity says *what* to do,
 * a reading track records *whether/how much* was done each calendar day.
 */
@Entity('reading_track')
@Index('idx_reading_track_owner_position', ['ownerId', 'position'])
export class ReadingTrack extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Husrev token name (e.g. `husrev-amber`) for the track accent color. */
  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  /**
   * Whether this track exposes a "Dinlenildi" (listened) toggle in addition to
   * the default "Okundu" (read) one — e.g. Cevşen is often listened to rather
   * than read.
   */
  @Column({ name: 'tracks_listened', type: 'boolean', default: false })
  tracksListened!: boolean;

  /** Logging cadence: 'DAILY' (default, one entry per day) or 'WEEKLY' (one entry per week at week's Monday). */
  @Column({ type: 'varchar', length: 10, default: 'DAILY' })
  cadence!: string;

  /** Free-form daily goal hint, e.g. "10 sayfa" or "1 cüz". */
  @Column({ name: 'daily_target', type: 'varchar', length: 120, nullable: true })
  dailyTarget!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
