import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user sidebar order. Strictly additive and idempotent: a nullable jsonb
 * column on app_user; null means the built-in default order.
 */
export class AddNavPreferencesToUser1715000040000 implements MigrationInterface {
  name = 'AddNavPreferencesToUser1715000040000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS nav_preferences JSONB`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE app_user DROP COLUMN IF EXISTS nav_preferences`);
  }
}
