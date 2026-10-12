import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 1 (ADR 6) — change_set infrastructure for recording MCP and domain
 * mutations with before/after snapshots and one-click undo.
 *
 * Strictly additive and idempotent migration:
 * - change_set: captures high-level mutation batch metadata (owner, source, label, status)
 * - change_entry: granular ordinal-indexed mutation operations (op, targetType, targetId, before, after)
 *
 * No RLS: multi-tenancy is enforced at the service layer via owner_id filtering.
 */
export class CreateChangeSets1715000036000 implements MigrationInterface {
  name = 'CreateChangeSets1715000036000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS change_set (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        source        VARCHAR(16) NOT NULL,
        label         VARCHAR(200) NOT NULL,
        status        VARCHAR(24) NOT NULL DEFAULT 'applied',
        undone_at     TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT ck_change_set_source CHECK (source IN ('mcp', 'web', 'telegram', 'slack', 'system')),
        CONSTRAINT ck_change_set_status CHECK (status IN ('applied', 'undone', 'partially_undone'))
      )
    `);

    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_change_set_owner_created ON change_set(owner_id, created_at DESC)`,
    );

    await qr.query(`
      CREATE TABLE IF NOT EXISTS change_entry (
        id            BIGSERIAL PRIMARY KEY,
        change_set_id BIGINT NOT NULL REFERENCES change_set(id) ON DELETE CASCADE,
        owner_id      BIGINT NOT NULL,
        ordinal       INTEGER NOT NULL,
        target_type   VARCHAR(24) NOT NULL,
        target_id     BIGINT NOT NULL,
        op            VARCHAR(16) NOT NULL,
        before        JSONB,
        after         JSONB,
        undone_at     TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_change_entry_target_type CHECK (target_type IN ('item', 'item_occurrence')),
        CONSTRAINT ck_change_entry_op CHECK (op IN ('create', 'update', 'delete', 'complete'))
      )
    `);

    await qr.query(
      `ALTER TABLE change_entry ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ`,
    );

    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_change_entry_set_ordinal ON change_entry(change_set_id, ordinal)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_change_entry_set ON change_entry(change_set_id)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_change_entry_owner ON change_entry(owner_id)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS change_entry CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS change_set CASCADE`);
  }
}
