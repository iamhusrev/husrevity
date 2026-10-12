import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Faz 2 (ADR 12) — Light Goal model.
 *
 * Strictly additive and idempotent migration:
 * - goal: hierarchical goal entity (year -> quarter -> month) with audit & soft-delete.
 * - items: adds nullable goal_id with idempotent foreign key.
 * - project: adds nullable goal_id with idempotent foreign key.
 *
 * No RLS: multi-tenancy is enforced at the service layer via owner_id filtering.
 */
export class CreateGoals1715000038000 implements MigrationInterface {
  name = 'CreateGoals1715000038000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS goal (
        id             BIGSERIAL PRIMARY KEY,
        owner_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title          VARCHAR(200) NOT NULL,
        notes          TEXT,
        horizon        VARCHAR(16) NOT NULL,
        period_start   DATE NOT NULL,
        period_end     DATE NOT NULL,
        parent_goal_id BIGINT REFERENCES goal(id) ON DELETE SET NULL,
        status         VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id  BIGINT,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id  BIGINT,
        deleted_at     TIMESTAMPTZ,
        CONSTRAINT ck_goal_horizon CHECK (horizon IN ('year', 'quarter', 'month')),
        CONSTRAINT ck_goal_status CHECK (status IN ('active', 'done', 'dropped')),
        CONSTRAINT ck_goal_period CHECK (period_end >= period_start)
      )
    `);

    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_goal_owner_horizon_start ON goal(owner_id, horizon, period_start)`,
    );
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_goal_parent ON goal(parent_goal_id)`);

    await qr.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS goal_id BIGINT`);
    await qr.query(`ALTER TABLE project ADD COLUMN IF NOT EXISTS goal_id BIGINT`);

    await qr.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_goal_id') THEN
          ALTER TABLE items ADD CONSTRAINT fk_items_goal_id FOREIGN KEY (goal_id) REFERENCES goal(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await qr.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_goal_id') THEN
          ALTER TABLE project ADD CONSTRAINT fk_project_goal_id FOREIGN KEY (goal_id) REFERENCES goal(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await qr.query(`CREATE INDEX IF NOT EXISTS idx_items_goal ON items(goal_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_project_goal ON project(goal_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS fk_items_goal_id`);
    await qr.query(`ALTER TABLE items DROP COLUMN IF EXISTS goal_id`);
    await qr.query(`ALTER TABLE project DROP CONSTRAINT IF EXISTS fk_project_goal_id`);
    await qr.query(`ALTER TABLE project DROP COLUMN IF EXISTS goal_id`);
    await qr.query(`DROP TABLE IF EXISTS goal CASCADE`);
  }
}
