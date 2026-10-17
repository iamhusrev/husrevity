import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Explicit, editable year on a learning topic. Strictly additive and
 * idempotent: a nullable smallint column with no default and no backfill;
 * null means "derive the year from created_at" (resolved in the DTO).
 */
export class AddLearningTopicYear1715000041000 implements MigrationInterface {
  name = 'AddLearningTopicYear1715000041000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE learning_topic ADD COLUMN IF NOT EXISTS year SMALLINT`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE learning_topic DROP COLUMN IF EXISTS year`);
  }
}
