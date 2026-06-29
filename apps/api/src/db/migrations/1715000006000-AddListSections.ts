import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grouped lists — a `list_section` is a named sub-heading inside a list, the way
 * the owner's planning spreadsheets split one sheet into several themed columns
 * (e.g. "İslam İlimleri" → Kelam/Fıkıh/Tasavvuf). Items point at a section via
 * `list_item.section_id` (NULL = ungrouped). Deleting a section sets its items'
 * `section_id` back to NULL (ON DELETE SET NULL) — items are never lost.
 */
export class AddListSections1715000006000 implements MigrationInterface {
  name = 'AddListSections1715000006000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE list_section (
        id            BIGSERIAL PRIMARY KEY,
        list_id       BIGINT NOT NULL REFERENCES todo_list(id) ON DELETE CASCADE,
        name          VARCHAR(128) NOT NULL,
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_list_section_list ON list_section(list_id)`);
    await qr.query(
      `CREATE INDEX idx_list_section_list_position ON list_section(list_id, position)`,
    );

    await qr.query(
      `ALTER TABLE list_item ADD COLUMN section_id BIGINT REFERENCES list_section(id) ON DELETE SET NULL`,
    );
    await qr.query(`CREATE INDEX idx_list_item_section ON list_item(section_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_list_item_section`);
    await qr.query(`ALTER TABLE list_item DROP COLUMN IF EXISTS section_id`);
    await qr.query(`DROP TABLE IF EXISTS list_section CASCADE`);
  }
}
