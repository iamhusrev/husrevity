import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the Gmail/Outlook mail integration and the AI chat feature.
 * (AI suggestions remain — they are stateless, no tables involved.)
 */
export class DropGmailAndAiChat1715000015000 implements MigrationInterface {
  name = 'DropGmailAndAiChat1715000015000';

  public async up(qr: QueryRunner): Promise<void> {
    // children before parents (gmail_message → gmail_account, ai_message → ai_conversation)
    await qr.query(`DROP TABLE IF EXISTS gmail_message`);
    await qr.query(`DROP TABLE IF EXISTS gmail_account`);
    await qr.query(`DROP TABLE IF EXISTS ai_message`);
    await qr.query(`DROP TABLE IF EXISTS ai_conversation`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // DDL copied verbatim from 1715000000000-Baseline.ts
    await qr.query(`
      CREATE TABLE gmail_account (
        id                BIGSERIAL PRIMARY KEY,
        owner_id          BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        email             VARCHAR(160) NOT NULL,
        display_name      VARCHAR(160),
        access_token_enc  TEXT NOT NULL,
        refresh_token_enc TEXT,
        token_expires_at  TIMESTAMPTZ,
        scopes            VARCHAR(512),
        history_id        VARCHAR(64),
        last_sync_at      TIMESTAMPTZ,
        provider          VARCHAR(16) NOT NULL DEFAULT 'google',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_gmail_account_owner ON gmail_account(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_gmail_account_owner_email_provider
         ON gmail_account(owner_id, email, provider) WHERE deleted_at IS NULL`,
    );

    await qr.query(`
      CREATE TABLE gmail_message (
        id                BIGSERIAL PRIMARY KEY,
        gmail_account_id  BIGINT NOT NULL REFERENCES gmail_account(id) ON DELETE CASCADE,
        gmail_message_id  VARCHAR(64) NOT NULL,
        thread_id         VARCHAR(64),
        snippet           TEXT,
        from_addr         VARCHAR(255),
        to_addr           VARCHAR(512),
        subject           VARCHAR(512),
        received_at       TIMESTAMPTZ,
        unread            BOOLEAN NOT NULL DEFAULT false,
        has_attachment    BOOLEAN NOT NULL DEFAULT false,
        labels            VARCHAR(512),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ,
        CONSTRAINT uq_gmail_message_account_msg UNIQUE (gmail_account_id, gmail_message_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_gmail_message_account ON gmail_message(gmail_account_id)`);
    await qr.query(
      `CREATE INDEX idx_gmail_message_account_received ON gmail_message(gmail_account_id, received_at)`,
    );

    await qr.query(`
      CREATE TABLE ai_conversation (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_ai_conversation_owner ON ai_conversation(owner_id)`);

    await qr.query(`
      CREATE TABLE ai_message (
        id              BIGSERIAL PRIMARY KEY,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        conversation_id BIGINT NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
        role            VARCHAR(16) NOT NULL,
        content         TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_ai_message_owner ON ai_message(owner_id)`);
    await qr.query(`CREATE INDEX idx_ai_message_conversation ON ai_message(conversation_id)`);
  }
}
