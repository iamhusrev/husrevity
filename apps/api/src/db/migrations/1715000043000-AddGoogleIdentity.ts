import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sign-in with Google: a durable link between a user and an external identity
 * (the provider's stable subject id, never the e-mail) plus a flag telling the
 * UI whether the account has a usable password.
 *
 * `password_hash` stays NOT NULL on purpose: Google-created users get a random
 * bcrypt hash, so an older image that still reads the column keeps working.
 *
 * up() only creates a table and adds a constant-default column (no backfill).
 * down() refuses while a Google-only user exists, because dropping the identity
 * table would lock that user out of the account. Set
 * ALLOW_GOOGLE_IDENTITY_DROP=1 to override on purpose.
 */
export class AddGoogleIdentity1715000043000 implements MigrationInterface {
  name = 'AddGoogleIdentity1715000043000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE user_identity (
        id               BIGSERIAL PRIMARY KEY,
        user_id          BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        provider         VARCHAR(32) NOT NULL,
        provider_subject VARCHAR(255) NOT NULL,
        email            VARCHAR(160),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_user_identity_provider_subject UNIQUE (provider, provider_subject),
        CONSTRAINT uq_user_identity_user_provider UNIQUE (user_id, provider)
      )
    `);
    await qr.query(
      `ALTER TABLE app_user ADD COLUMN password_login_enabled BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (process.env.ALLOW_GOOGLE_IDENTITY_DROP !== '1') {
      const rows: Array<{ count: string }> = await qr.query(`
        SELECT count(*)::text AS count
          FROM app_user u
         WHERE u.password_login_enabled = false
           AND EXISTS (SELECT 1 FROM user_identity i WHERE i.user_id = u.id)
      `);
      const googleOnly = Number(rows[0]?.count ?? 0);
      if (googleOnly > 0) {
        throw new Error(
          `Refusing to revert AddGoogleIdentity: ${googleOnly} user(s) can only sign in with Google ` +
            `and would be locked out. Set ALLOW_GOOGLE_IDENTITY_DROP=1 to drop anyway.`,
        );
      }
    }
    await qr.query(`ALTER TABLE app_user DROP COLUMN IF EXISTS password_login_enabled`);
    await qr.query(`DROP TABLE IF EXISTS user_identity`);
  }
}
