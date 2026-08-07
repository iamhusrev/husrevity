import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 of project collaboration: schema only, no service/controller
 * changes yet.
 *
 * - project_member: join table between project and app_user. The owner is
 *   itself a member row (role='OWNER') so authorization checks never need to
 *   branch on project.owner_id separately — see project-access.service.ts in
 *   a later phase. Partial-unique indexes (WHERE deleted_at IS NULL) mean a
 *   removed-then-re-added member doesn't collide on the old soft-deleted row,
 *   and a project can never have more than one live OWNER.
 * - Backfill inserts an OWNER project_member row for every existing project
 *   (soft-deleted ones included, so a restored project still has its owner
 *   membership intact), guarded against orphaned owner_id references.
 * - project_invite: token-based invite for both registered and unregistered
 *   emails, mirroring the admin/user_invite pattern (SHA-256 token hash only,
 *   TTL, accepted_at/accepted_user_id).
 * - task.assignee_id: nullable FK to app_user, ON DELETE SET NULL, for
 *   per-task assignment within a shared project.
 */
export class AddProjectCollaboration1715000016000 implements MigrationInterface {
  name = 'AddProjectCollaboration1715000016000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE project_member (
        id            BIGSERIAL PRIMARY KEY,
        project_id    BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        user_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        role          VARCHAR(16) NOT NULL DEFAULT 'EDITOR',
        invited_by_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
        joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT ck_project_member_role CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER'))
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX uq_project_member_project_user ON project_member(project_id, user_id) WHERE deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_project_member_owner ON project_member(project_id) WHERE role = 'OWNER' AND deleted_at IS NULL`,
    );
    await qr.query(`CREATE INDEX idx_project_member_user ON project_member(user_id)`);
    await qr.query(`CREATE INDEX idx_project_member_project ON project_member(project_id)`);

    // Backfill: an OWNER row for EVERY project (soft-deleted ones too — a
    // restored project must still have its owner membership intact).
    await qr.query(`
      INSERT INTO project_member (project_id, user_id, role, joined_at, created_at, updated_at)
      SELECT p.id, p.owner_id, 'OWNER', p.created_at, now(), now() FROM project p
      WHERE EXISTS (SELECT 1 FROM app_user u WHERE u.id = p.owner_id)
    `);

    await qr.query(`
      CREATE TABLE project_invite (
        id                BIGSERIAL PRIMARY KEY,
        project_id        BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        invited_by_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        email             VARCHAR(160) NOT NULL,
        token_hash        VARCHAR(64) NOT NULL,
        role              VARCHAR(16) NOT NULL DEFAULT 'EDITOR',
        expires_at        TIMESTAMPTZ NOT NULL,
        accepted_at       TIMESTAMPTZ,
        accepted_user_id  BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ,
        CONSTRAINT ck_project_invite_role CHECK (role IN ('EDITOR', 'VIEWER'))
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX uq_project_invite_token_hash ON project_invite(token_hash)`,
    );
    await qr.query(`CREATE INDEX idx_project_invite_email ON project_invite(LOWER(email))`);
    await qr.query(`CREATE INDEX idx_project_invite_project ON project_invite(project_id)`);

    await qr.query(
      `ALTER TABLE task ADD COLUMN assignee_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL`,
    );
    await qr.query(`CREATE INDEX idx_task_assignee ON task(assignee_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_task_assignee`);
    await qr.query(`ALTER TABLE task DROP COLUMN IF EXISTS assignee_id`);
    await qr.query(`DROP TABLE IF EXISTS project_invite CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS project_member CASCADE`);
  }
}
