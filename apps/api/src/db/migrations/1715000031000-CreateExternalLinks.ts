import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 5 (Google Calendar) — ExternalLink table mapping Husrevity `items` rows
 * to external provider event IDs (e.g. Google Calendar event ID and etag).
 */
export class CreateExternalLinks1715000031000 implements MigrationInterface {
  name = 'CreateExternalLinks1715000031000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE external_link (
        id              BIGSERIAL PRIMARY KEY,
        item_id         BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        provider        VARCHAR(64) NOT NULL,
        external_id     VARCHAR(255) NOT NULL,
        etag            VARCHAR(255),
        last_synced_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ,
        CONSTRAINT ck_external_link_provider CHECK (provider IN ('google_calendar'))
      )
    `);
    await qr.query(`CREATE INDEX idx_external_link_item ON external_link(item_id)`);
    await qr.query(
      `CREATE INDEX idx_external_link_provider_external_id ON external_link(provider, external_id) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_external_link_item_provider ON external_link(item_id, provider) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS external_link CASCADE`);
  }
}
