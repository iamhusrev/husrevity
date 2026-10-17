import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Offline sync support (`GET /api/sync?since=`).
 *
 * - Every synced table gets an (owner_id, updated_at) index: both the live-row and the tombstone
 *   queries filter on exactly that pair.
 * - note_tag is now soft-deleted (so deletions reach sync clients as tombstones), which means
 *   its UNIQUE (owner_id, name) constraint must only cover live rows, otherwise a deleted tag
 *   would block re-creating a tag with the same name. item_occurrences already works this way.
 *
 * Idempotent; nothing is dropped except the old constraint it replaces.
 */
export class AddSyncIndexes1715000042000 implements MigrationInterface {
  name = 'AddSyncIndexes1715000042000';

  private readonly syncedTables = [
    'items',
    'item_occurrences',
    'note',
    'note_tag',
    'project',
    'goal',
  ];

  public async up(qr: QueryRunner): Promise<void> {
    for (const table of this.syncedTables) {
      await qr.query(
        `CREATE INDEX IF NOT EXISTS idx_${table}_owner_updated ON ${table}(owner_id, updated_at)`,
      );
    }

    await qr.query(`ALTER TABLE note_tag DROP CONSTRAINT IF EXISTS uq_note_tag_owner_name`);
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_note_tag_owner_name_live ON note_tag(owner_id, name) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS uq_note_tag_owner_name_live`);
    // A deleted tag may share its name with a live one (or with another deleted one); the
    // restored constraint covers every row, so give each deleted tag a unique name. Rows are kept.
    await qr.query(
      `UPDATE note_tag SET name = left(name, 40) || '#' || id WHERE deleted_at IS NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE note_tag ADD CONSTRAINT uq_note_tag_owner_name UNIQUE (owner_id, name)`,
    );

    for (const table of this.syncedTables) {
      await qr.query(`DROP INDEX IF EXISTS idx_${table}_owner_updated`);
    }
  }
}
