import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `cadence` column to `reading_track` — 'DAILY' (default, one entry per
 * day) or 'WEEKLY' (one entry per week, keyed by the week's Monday).
 */
export class AddReadingTrackCadence1715000008000 implements MigrationInterface {
  name = 'AddReadingTrackCadence1715000008000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE reading_track ADD COLUMN cadence VARCHAR(10) NOT NULL DEFAULT 'DAILY'`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE reading_track DROP COLUMN cadence`);
  }
}
