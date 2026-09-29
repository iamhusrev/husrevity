import { MigrationInterface, QueryRunner } from 'typeorm';

/** Faz 3: device registration for push, ahead of the iOS app (Faz 8). */
export class CreateDevices1715000026000 implements MigrationInterface {
  name = 'CreateDevices1715000026000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE device (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        platform      VARCHAR(16) NOT NULL,
        push_token    VARCHAR(512) NOT NULL,
        last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT ck_device_platform CHECK (platform IN ('ios', 'android', 'web'))
      )
    `);
    await qr.query(`CREATE INDEX idx_device_owner ON device(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_device_owner_token ON device(owner_id, push_token) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS device CASCADE`);
  }
}
