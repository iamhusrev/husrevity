import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sport menu — per-user fitness profile (level, weekly hour target,
 * preferred activities, goals/notes).
 */
export class CreateSportProfile1715000011000 implements MigrationInterface {
  name = 'CreateSportProfile1715000011000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sport_profile (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        fitness_level         VARCHAR(50) NOT NULL DEFAULT 'beginner',
        weekly_hours          INTEGER NOT NULL DEFAULT 5,
        preferred_activities  JSONB NOT NULL DEFAULT '[]',
        goals                 TEXT,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_sport_profile_owner ON sport_profile(owner_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS sport_profile CASCADE`);
  }
}
