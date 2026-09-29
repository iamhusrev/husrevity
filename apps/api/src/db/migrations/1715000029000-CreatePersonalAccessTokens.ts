import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 4 (MCP server) Auth v1 — personal access tokens a user issues for
 * themselves via POST /pat, then hands to `claude mcp add --header
 * "Authorization: Bearer $PAT"`. Only the sha256 hash is ever stored (same
 * pattern as refresh_token); the raw token is shown to the user exactly
 * once, at issuance.
 */
export class CreatePersonalAccessTokens1715000029000 implements MigrationInterface {
  name = 'CreatePersonalAccessTokens1715000029000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE personal_access_token (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(120) NOT NULL,
        token_hash    VARCHAR(128) NOT NULL,
        scopes        JSONB NOT NULL DEFAULT '[]',
        last_used_at  TIMESTAMPTZ,
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_personal_access_token_owner ON personal_access_token(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_personal_access_token_hash ON personal_access_token(token_hash) WHERE deleted_at IS NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS personal_access_token CASCADE`);
  }
}
