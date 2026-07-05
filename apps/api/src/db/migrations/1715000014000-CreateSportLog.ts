import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sport menu — an executed workout record, optionally linked back to the
 * sport_session it fulfills.
 */
export class CreateSportLog1715000014000 implements MigrationInterface {
  name = 'CreateSportLog1715000014000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sport_log (
        id                BIGSERIAL PRIMARY KEY,
        owner_id          BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        session_id        BIGINT REFERENCES sport_session(id) ON DELETE SET NULL,
        executed_date     DATE NOT NULL,
        actual_duration   INTEGER NOT NULL,
        completed         BOOLEAN NOT NULL DEFAULT false,
        intensity         INTEGER NOT NULL DEFAULT 5,
        notes             TEXT,
        calories_burned   INTEGER,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_sport_log_owner_date ON sport_log(owner_id, executed_date)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS sport_log CASCADE`);
  }
}
