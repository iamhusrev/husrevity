import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 3: transactional outbox — a domain service writes a row here in the
 * SAME transaction as its own change, and the outbox worker (a later item)
 * polls unprocessed rows and enqueues them as pg-boss jobs. Nothing writes
 * to this table yet — the infrastructure is being prepared ahead of use.
 */
export class CreateOutboxEvents1715000027000 implements MigrationInterface {
  name = 'CreateOutboxEvents1715000027000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE outbox_events (
        id            BIGSERIAL PRIMARY KEY,
        type          VARCHAR(64) NOT NULL,
        payload       JSONB NOT NULL,
        processed_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_outbox_events_unprocessed ON outbox_events(created_at) WHERE processed_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS outbox_events CASCADE`);
  }
}
