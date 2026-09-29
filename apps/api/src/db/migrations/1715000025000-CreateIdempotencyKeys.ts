import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 3 (mobile-ready API): lets an offline-queue client safely retry a
 * POST/PATCH after a dropped response without double-applying it — see
 * apps/api/src/common/idempotency.interceptor.ts.
 */
export class CreateIdempotencyKeys1715000025000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1715000025000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE idempotency_key (
        id              BIGSERIAL PRIMARY KEY,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        key             VARCHAR(255) NOT NULL,
        method          VARCHAR(8) NOT NULL,
        path            VARCHAR(255) NOT NULL,
        response_status INTEGER NOT NULL,
        response_body   JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX uq_idempotency_key_owner_key ON idempotency_key(owner_id, key) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS idempotency_key CASCADE`);
  }
}
