import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 5 (Google Calendar) — IntegrationAccount table storing encrypted OAuth
 * access/refresh tokens, granted scopes, sync cursor (syncToken), and Husrevity
 * calendar ID per user per provider.
 */
export class CreateIntegrationAccounts1715000030000 implements MigrationInterface {
  name = 'CreateIntegrationAccounts1715000030000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE integration_account (
        id                      BIGSERIAL PRIMARY KEY,
        owner_id                BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        provider                VARCHAR(64) NOT NULL,
        encrypted_access_token  TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        scopes                  JSONB NOT NULL DEFAULT '[]',
        status                  VARCHAR(32) NOT NULL DEFAULT 'connected',
        sync_token              TEXT,
        calendar_id             VARCHAR(255),
        connected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_sync_at            TIMESTAMPTZ,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id           BIGINT,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id           BIGINT,
        deleted_at              TIMESTAMPTZ,
        CONSTRAINT ck_integration_account_provider CHECK (provider IN ('google_calendar')),
        CONSTRAINT ck_integration_account_status CHECK (status IN ('connected', 'disconnected', 'error'))
      )
    `);
    await qr.query(`CREATE INDEX idx_integration_account_owner ON integration_account(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_integration_account_owner_provider ON integration_account(owner_id, provider) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS integration_account CASCADE`);
  }
}
