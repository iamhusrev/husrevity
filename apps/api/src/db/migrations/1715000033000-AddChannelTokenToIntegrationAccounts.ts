import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 5 (Google Calendar) — Adds a per-channel random verification token
 * (channel_token) to integration_account. Passed as `token` when registering
 * a Google `events.watch` channel and echoed back by Google on every push
 * notification as the `X-Goog-Channel-Token` header — the documented way to
 * verify a webhook call actually came from Google and not a forged request
 * guessing/replaying channelId + resourceId.
 */
export class AddChannelTokenToIntegrationAccounts1715000033000 implements MigrationInterface {
  name = 'AddChannelTokenToIntegrationAccounts1715000033000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE integration_account
        ADD COLUMN channel_token VARCHAR(255)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE integration_account
        DROP COLUMN IF EXISTS channel_token
    `);
  }
}
