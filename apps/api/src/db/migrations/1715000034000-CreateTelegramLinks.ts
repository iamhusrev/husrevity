import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 6 (Telegram Bot) — Create telegram_link table mapping Husrevity app_user
 * to a Telegram chat_id via a temporary link code.
 */
export class CreateTelegramLinks1715000034000 implements MigrationInterface {
  name = 'CreateTelegramLinks1715000034000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE telegram_link (
        id                   BIGSERIAL PRIMARY KEY,
        owner_id             BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        chat_id              BIGINT,
        link_code            VARCHAR(64),
        link_code_expires_at TIMESTAMPTZ,
        status               VARCHAR(32) NOT NULL DEFAULT 'pending',
        linked_at            TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id        BIGINT,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id        BIGINT,
        deleted_at           TIMESTAMPTZ,
        CONSTRAINT ck_telegram_link_status CHECK (status IN ('pending', 'linked', 'unlinked'))
      )
    `);
    await qr.query(`CREATE INDEX idx_telegram_link_owner ON telegram_link(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_telegram_link_owner ON telegram_link(owner_id) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_telegram_link_chat ON telegram_link(chat_id) WHERE deleted_at IS NULL AND chat_id IS NOT NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_telegram_link_code ON telegram_link(link_code) WHERE deleted_at IS NULL AND link_code IS NOT NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS telegram_link CASCADE`);
  }
}
