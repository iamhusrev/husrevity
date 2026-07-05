import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sport menu — multi-week programs (hand-built or AI-generated) grouping
 * scheduled {@link CreateSportSession} rows.
 */
export class CreateSportProgram1715000012000 implements MigrationInterface {
  name = 'CreateSportProgram1715000012000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sport_program (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(120) NOT NULL,
        description   TEXT,
        week_count    INTEGER NOT NULL,
        program_type  VARCHAR(50) NOT NULL DEFAULT 'WEEKLY',
        ai_generated  BOOLEAN NOT NULL DEFAULT false,
        start_date    DATE NOT NULL,
        end_date      DATE,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_sport_program_owner ON sport_program(owner_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS sport_program CASCADE`);
  }
}
