import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets change_entry point at learning rows so MCP learning edits (rename,
 * reorder, move, delete) can be undone. Only the CHECK constraint changes;
 * existing rows already satisfy the wider list.
 */
export class AddLearningChangeEntryTargets1715000042000 implements MigrationInterface {
  name = 'AddLearningChangeEntryTargets1715000042000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE change_entry DROP CONSTRAINT IF EXISTS ck_change_entry_target_type`,
    );
    await qr.query(`
      ALTER TABLE change_entry ADD CONSTRAINT ck_change_entry_target_type CHECK (
        target_type IN (
          'item', 'item_occurrence',
          'learning_topic', 'learning_subtopic', 'learning_item'
        )
      )
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // The narrower constraint cannot hold learning rows, so they must go first.
    await qr.query(`DELETE FROM change_entry WHERE target_type LIKE 'learning_%'`);
    await qr.query(
      `ALTER TABLE change_entry DROP CONSTRAINT IF EXISTS ck_change_entry_target_type`,
    );
    await qr.query(`
      ALTER TABLE change_entry ADD CONSTRAINT ck_change_entry_target_type CHECK (
        target_type IN ('item', 'item_occurrence')
      )
    `);
  }
}
