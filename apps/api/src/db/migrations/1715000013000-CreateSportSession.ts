import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sport menu — a single planned activity slot within a sport_program,
 * scheduled on a given day of the week.
 */
export class CreateSportSession1715000013000 implements MigrationInterface {
  name = 'CreateSportSession1715000013000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sport_session (
        id                    BIGSERIAL PRIMARY KEY,
        program_id            BIGINT REFERENCES sport_program(id) ON DELETE CASCADE,
        activity_type         VARCHAR(50) NOT NULL,
        location              VARCHAR(50) NOT NULL,
        name                  VARCHAR(120) NOT NULL,
        planned_day_of_week   INTEGER NOT NULL DEFAULT 0,
        planned_duration      INTEGER NOT NULL,
        difficulty            VARCHAR(50) NOT NULL DEFAULT 'MODERATE',
        description           TEXT NOT NULL,
        "position"            INTEGER NOT NULL DEFAULT 0,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_sport_session_program ON sport_session(program_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS sport_session CASCADE`);
  }
}
