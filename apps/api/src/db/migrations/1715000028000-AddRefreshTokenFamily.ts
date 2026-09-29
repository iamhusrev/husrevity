import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh-token rotation reuse-detection (security-critical, human-reviewed
 * per this repo's own convention — see auth.service.ts's refresh()).
 *
 * `family_id` links every token descended from the same login/register
 * through successive rotations. Existing rows are backfilled to their own
 * `id` (each becomes the head of its own family) — no pgcrypto/uuid
 * extension needed, and no currently-active session is invalidated by
 * this migration; only future rotations start sharing a family_id.
 */
export class AddRefreshTokenFamily1715000028000 implements MigrationInterface {
  name = 'AddRefreshTokenFamily1715000028000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE refresh_token ADD COLUMN family_id VARCHAR(64)`);
    await qr.query(`UPDATE refresh_token SET family_id = id::text WHERE family_id IS NULL`);
    await qr.query(`ALTER TABLE refresh_token ALTER COLUMN family_id SET NOT NULL`);
    await qr.query(`CREATE INDEX idx_refresh_token_family_id ON refresh_token(family_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_refresh_token_family_id`);
    await qr.query(`ALTER TABLE refresh_token DROP COLUMN IF EXISTS family_id`);
  }
}
