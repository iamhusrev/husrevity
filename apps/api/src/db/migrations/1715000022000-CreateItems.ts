import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 1 of the unified Item model (see docs/inventory.md and the Husrevity
 * simplification plan). `items` will absorb task/reminder/calendar_event/
 * routine/time_block/learning_item/sport_session/sport_log — see the
 * backfill migration for the per-source mapping. Old tables stay live and
 * readable until a later phase drops them.
 *
 * `legacy_table`/`legacy_id` exist purely to make the backfill migration
 * idempotent (safe to re-run) via `uq_items_legacy_source` — items created
 * directly through the new API leave both NULL.
 *
 * No RLS: this codebase has no Postgres row-level-security anywhere.
 * Multi-tenancy is enforced at the service layer via owner_id filtering
 * (and ProjectAccessService for project-scoped rows), exactly like every
 * other domain table.
 */
export class CreateItems1715000022000 implements MigrationInterface {
  name = 'CreateItems1715000022000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE items (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        kind                  VARCHAR(16) NOT NULL,
        title                 VARCHAR(255) NOT NULL,
        notes                 TEXT,
        context               VARCHAR(32),
        project_id            BIGINT REFERENCES project(id) ON DELETE SET NULL,
        block_id              BIGINT REFERENCES items(id) ON DELETE SET NULL,
        scheduled_at          TIMESTAMPTZ,
        duration_min          INTEGER,
        due_at                TIMESTAMPTZ,
        notify_minutes_before INTEGER,
        rrule                 VARCHAR(512),
        status                VARCHAR(16) NOT NULL DEFAULT 'open',
        completed_at          TIMESTAMPTZ,
        payload               JSONB NOT NULL DEFAULT '{}',
        source                VARCHAR(16) NOT NULL DEFAULT 'web',
        legacy_table          VARCHAR(32),
        legacy_id             BIGINT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ,
        CONSTRAINT ck_items_kind CHECK (kind IN ('task', 'event', 'log')),
        CONSTRAINT ck_items_status CHECK (status IN ('open', 'done', 'cancelled')),
        CONSTRAINT ck_items_source CHECK (source IN ('web', 'ios', 'mcp', 'telegram', 'gmail', 'gcal', 'slack'))
      )
    `);
    await qr.query(`CREATE INDEX idx_items_owner ON items(owner_id)`);
    await qr.query(
      `CREATE INDEX idx_items_owner_scheduled ON items(owner_id, scheduled_at) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_items_owner_due ON items(owner_id, due_at) WHERE deleted_at IS NULL AND status = 'open'`,
    );
    await qr.query(`CREATE INDEX idx_items_project ON items(project_id)`);
    await qr.query(`CREATE INDEX idx_items_block ON items(block_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_items_legacy_source ON items(legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS items CASCADE`);
  }
}
