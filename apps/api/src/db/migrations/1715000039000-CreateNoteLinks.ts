import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 2 (ADR 14) — Generic Note Links architecture.
 *
 * Strictly additive and idempotent migration:
 * - note_link: polymorphic link connecting a note to an item, project, or goal.
 * - No foreign key constraint on target_id because it is polymorphic (points to items, project, or goal tables).
 *
 * No RLS: multi-tenancy is enforced at the service layer via owner_id filtering.
 */
export class CreateNoteLinks1715000039000 implements MigrationInterface {
  name = 'CreateNoteLinks1715000039000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS note_link (
        id             BIGSERIAL PRIMARY KEY,
        owner_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        note_id        BIGINT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
        target_type    VARCHAR(16) NOT NULL CHECK (target_type IN ('item','project','goal')),
        target_id      BIGINT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id  BIGINT,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id  BIGINT,
        deleted_at     TIMESTAMPTZ
      )
    `);

    // Unique index for live links (prevent duplicate active link for same note and target)
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_note_link_live ON note_link(note_id, target_type, target_id) WHERE deleted_at IS NULL`,
    );

    // Composite index for querying links by target for a given owner
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_note_link_owner_target ON note_link(owner_id, target_type, target_id)`,
    );

    // Index for querying links for a note
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_note_link_note ON note_link(note_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS note_link CASCADE`);
  }
}
