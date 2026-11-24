import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-side state for one browser OAuth round trip (Google sign-in, account
 * linking, and later calendar connect). Secrets are stored hashed (state,
 * nonce, flow cookie secret, handoff code); the Google authorization code and
 * the PKCE verifier sent to Google are stored encrypted until the exchange.
 *
 * `purpose` allows `calendar_connect` already so the later calendar slice does
 * not need a CHECK change. Only CREATE TABLE: no existing table is touched.
 */
export class CreateOAuthFlow1715000044000 implements MigrationInterface {
  name = 'CreateOAuthFlow1715000044000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE oauth_flow (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purpose                VARCHAR(24) NOT NULL,
        user_id                BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
        start_ticket_hash      VARCHAR(64),
        state_hash             VARCHAR(64),
        nonce_hash             VARCHAR(64),
        cookie_secret_hash     VARCHAR(64),
        code_challenge         VARCHAR(128) NOT NULL,
        encrypted_pkce_verifier TEXT,
        encrypted_google_code  TEXT,
        handoff_code_hash      VARCHAR(64),
        handoff_expires_at     TIMESTAMPTZ,
        callback_at            TIMESTAMPTZ,
        expires_at             TIMESTAMPTZ NOT NULL,
        consumed_at            TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_oauth_flow_purpose CHECK (purpose IN ('login', 'link', 'calendar_connect'))
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX uq_oauth_flow_state_hash ON oauth_flow(state_hash) WHERE state_hash IS NOT NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_oauth_flow_handoff_hash ON oauth_flow(handoff_code_hash) WHERE handoff_code_hash IS NOT NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_oauth_flow_start_ticket ON oauth_flow(start_ticket_hash) WHERE start_ticket_hash IS NOT NULL`,
    );
    await qr.query(`CREATE INDEX idx_oauth_flow_expires_at ON oauth_flow(expires_at)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS oauth_flow`);
  }
}
