import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `project.code` and `app_user.email` currently carry plain (non-partial)
 * unique constraints, so a soft-deleted row keeps permanently squatting on
 * its code/email — a fresh create (or a re-registration) collides with the
 * dead row forever, even though `ProjectService.create()`/`restore()` and
 * the auth/admin/invite flows all treat soft-deleted rows as "gone".
 *
 * This migration converts both to partial unique indexes scoped to live
 * rows (`WHERE deleted_at IS NULL`), matching the pattern already used by
 * `uq_project_member_project_user`, `uq_notification_source_live`, and
 * `uq_push_subscription_endpoint_live` (see 1715000000000-Baseline.ts and
 * 1715000016000-AddProjectCollaboration.ts). Soft-deleted rows keep their
 * original code/email — restore still works exactly as before — but a new
 * live row can reuse that code/email freely.
 *
 * `code` is VARCHAR(32); step 1 below can grow a value past that limit when
 * disambiguating duplicates among *deleted* rows, so the column is widened
 * to VARCHAR(64) first. (`app_user.email` is VARCHAR(160) — no dedup suffix
 * ever gets appended there since two deleted rows can already coexist with
 * the same email once the constraint is gone; nothing to widen.)
 */
export class PartialUniqueOnSoftDelete1715000018000 implements MigrationInterface {
  name = 'PartialUniqueOnSoftDelete1715000018000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── project.code ─────────────────────────────────────────────────────
    await qr.query(`ALTER TABLE project ALTER COLUMN code TYPE VARCHAR(64)`);

    // Disambiguate duplicate (owner_id, code) pairs that exist ONLY among
    // already-deleted rows (a live row was never allowed to collide with
    // another live row, so this only ever touches deleted-vs-deleted pairs).
    await qr.query(`
      UPDATE project
         SET code = code || '__del_' || id
       WHERE deleted_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM project p2
            WHERE p2.owner_id = project.owner_id
              AND p2.code = project.code
              AND p2.id <> project.id
         )
    `);

    await qr.query(`ALTER TABLE project DROP CONSTRAINT uq_project_owner_code`);
    await qr.query(`
      CREATE UNIQUE INDEX uq_project_owner_code_live
        ON project(owner_id, code) WHERE deleted_at IS NULL
    `);

    // ── app_user.email ───────────────────────────────────────────────────
    // Inline `UNIQUE` on the column, so Postgres auto-named the constraint
    // `app_user_email_key`. Look it up rather than hardcode it, in case a
    // prior manual intervention renamed it.
    const rows: Array<{ conname: string }> = await qr.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'app_user'::regclass
         AND contype = 'u'
         AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'app_user'::regclass AND attname = 'email')
         ]
    `);
    for (const { conname } of rows) {
      await qr.query(`ALTER TABLE app_user DROP CONSTRAINT "${conname}"`);
    }
    await qr.query(`
      CREATE UNIQUE INDEX uq_app_user_email_live
        ON app_user(email) WHERE deleted_at IS NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS uq_app_user_email_live`);
    await qr.query(`ALTER TABLE app_user ADD CONSTRAINT app_user_email_key UNIQUE (email)`);

    await qr.query(`DROP INDEX IF EXISTS uq_project_owner_code_live`);
    await qr.query(`ALTER TABLE project ADD CONSTRAINT uq_project_owner_code UNIQUE (owner_id, code)`);
    // Deliberately NOT reverting the `__del_<id>` disambiguation suffixes or
    // the VARCHAR(64) widening — both are inert once the constraint is back
    // to plain, and reversing them could reintroduce the very collisions
    // this migration exists to resolve.
  }
}
