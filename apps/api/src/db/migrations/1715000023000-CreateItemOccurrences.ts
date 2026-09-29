import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sparse per-occurrence completion table for recurring items (items with a
 * non-null `rrule`, or items whose block_id points at one). A row exists
 * only when a given calendar date deviates from the implicit default
 * "open" state — there is no pre-materialization of future dates.
 *
 * `occurs_on` is a DATE (not a timestamp): an occurrence is a calendar day
 * in the item's local timezone (Europe/Istanbul), not an instant. Turning
 * a date + the item's time-of-day into a concrete UTC instant is entirely
 * the responsibility of item-recurrence.service.ts, not this table.
 */
export class CreateItemOccurrences1715000023000 implements MigrationInterface {
  name = 'CreateItemOccurrences1715000023000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE item_occurrences (
        id            BIGSERIAL PRIMARY KEY,
        item_id       BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        occurs_on     DATE NOT NULL,
        status        VARCHAR(16) NOT NULL,
        completed_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT ck_item_occurrences_status CHECK (status IN ('done', 'skipped'))
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX uq_item_occurrences_item_date ON item_occurrences(item_id, occurs_on) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_item_occurrences_owner_date ON item_occurrences(owner_id, occurs_on)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS item_occurrences CASCADE`);
  }
}
