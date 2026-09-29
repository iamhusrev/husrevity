import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 9 (Slack Bot) — Create slack_link table mapping Husrevity app_user
 * to a Slack slack_user_id via a temporary link code.
 */
export class CreateSlackLinks1715000035000 implements MigrationInterface {
  name = 'CreateSlackLinks1715000035000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE slack_link (
        id                   BIGSERIAL PRIMARY KEY,
        owner_id             BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        slack_user_id        VARCHAR(32),
        link_code            VARCHAR(64),
        link_code_expires_at TIMESTAMPTZ,
        status               VARCHAR(32) NOT NULL DEFAULT 'pending',
        linked_at            TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id        BIGINT,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id        BIGINT,
        deleted_at           TIMESTAMPTZ,
        CONSTRAINT ck_slack_link_status CHECK (status IN ('pending', 'linked', 'unlinked'))
      )
    `);
    await qr.query(`CREATE INDEX idx_slack_link_owner ON slack_link(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_slack_link_owner ON slack_link(owner_id) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_slack_link_user ON slack_link(slack_user_id) WHERE deleted_at IS NULL AND slack_user_id IS NOT NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_slack_link_code ON slack_link(link_code) WHERE deleted_at IS NULL AND link_code IS NOT NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS slack_link CASCADE`);
  }
}
