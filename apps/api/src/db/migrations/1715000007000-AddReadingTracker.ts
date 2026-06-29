import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Okumalar — the daily reading/habit tracker. A `reading_track` is a recurring
 * thing the owner reads each day (Kur'an, Cevşen, Risale…); a `reading_log` is
 * one calendar day's entry for a track (pages covered + read/listened flags).
 * At most one live log per (track, date) — enforced by a partial unique index
 * that ignores soft-deleted rows — upserted from the date-grid UI.
 */
export class AddReadingTracker1715000007000 implements MigrationInterface {
  name = 'AddReadingTracker1715000007000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE reading_track (
        id              BIGSERIAL PRIMARY KEY,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name            VARCHAR(120) NOT NULL,
        color_token     VARCHAR(24),
        tracks_listened BOOLEAN NOT NULL DEFAULT false,
        daily_target    VARCHAR(120),
        position        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_reading_track_owner_position ON reading_track(owner_id, position)`,
    );

    await qr.query(`
      CREATE TABLE reading_log (
        id            BIGSERIAL PRIMARY KEY,
        track_id      BIGINT NOT NULL REFERENCES reading_track(id) ON DELETE CASCADE,
        log_date      DATE NOT NULL,
        page_range    VARCHAR(120),
        read          BOOLEAN NOT NULL DEFAULT false,
        listened      BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_reading_log_track_date ON reading_log(track_id, log_date)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_reading_log_track_date ON reading_log(track_id, log_date) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const t of ['reading_log', 'reading_track']) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
