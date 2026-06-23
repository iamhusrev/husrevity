import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evkat redesign — the daily routine *template*. A `routine_segment` is a named
 * slice of every day (e.g. "Güne Hazırlık" 06:00–08:00) carrying ordered
 * `routine_activity` rows. Times are minutes-from-midnight so segments are
 * date-free and repeat daily. The old per-date `time_block` table is left
 * intact (it can be repurposed for the calendar later).
 */
export class AddRoutineModule1715000005000 implements MigrationInterface {
  name = 'AddRoutineModule1715000005000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE routine_segment (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(120) NOT NULL,
        start_minute  INTEGER,
        end_minute    INTEGER,
        theme         VARCHAR(60),
        color_token   VARCHAR(24),
        notes         TEXT,
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_routine_segment_owner_position ON routine_segment(owner_id, position)`,
    );

    await qr.query(`
      CREATE TABLE routine_activity (
        id            BIGSERIAL PRIMARY KEY,
        segment_id    BIGINT NOT NULL REFERENCES routine_segment(id) ON DELETE CASCADE,
        text          VARCHAR(300) NOT NULL,
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_routine_activity_segment_position ON routine_activity(segment_id, position)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const t of ['routine_activity', 'routine_segment']) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
