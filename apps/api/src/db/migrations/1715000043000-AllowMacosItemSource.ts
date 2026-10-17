import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The native macOS client tags the items it creates with source = 'macos'. Widens the CHECK
 * created in CreateItems; every previously valid value stays valid.
 */
export class AllowMacosItemSource1715000043000 implements MigrationInterface {
  name = 'AllowMacosItemSource1715000043000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS ck_items_source`);
    await qr.query(
      `ALTER TABLE items ADD CONSTRAINT ck_items_source CHECK (source IN ('web', 'ios', 'macos', 'mcp', 'telegram', 'gmail', 'gcal', 'slack'))`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Rows written by the Mac client would violate the narrower CHECK. They are relabelled
    // (not deleted) so the revert cannot fail or lose data; the original label is gone.
    await qr.query(`UPDATE items SET source = 'ios' WHERE source = 'macos'`);
    await qr.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS ck_items_source`);
    await qr.query(
      `ALTER TABLE items ADD CONSTRAINT ck_items_source CHECK (source IN ('web', 'ios', 'mcp', 'telegram', 'gmail', 'gcal', 'slack'))`,
    );
  }
}
