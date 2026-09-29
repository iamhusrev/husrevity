import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 5 (Google Calendar) — Add watch channel parameters (channel_id, resource_id, channel_expiration)
 * to integration_account table for Google Calendar push notifications (events.watch).
 */
export class AddWatchChannelToIntegrationAccounts1715000032000 implements MigrationInterface {
  name = 'AddWatchChannelToIntegrationAccounts1715000032000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE integration_account
        ADD COLUMN channel_id VARCHAR(255),
        ADD COLUMN resource_id VARCHAR(255),
        ADD COLUMN channel_expiration TIMESTAMPTZ
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE integration_account
        DROP COLUMN IF EXISTS channel_expiration,
        DROP COLUMN IF EXISTS resource_id,
        DROP COLUMN IF EXISTS channel_id
    `);
  }
}
