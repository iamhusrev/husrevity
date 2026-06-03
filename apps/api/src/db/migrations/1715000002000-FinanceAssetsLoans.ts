import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the net-worth side of the finance module: assets the owner holds,
 * installment loans ("krediler" / taksitli borçlar) and their per-installment
 * schedule rows. Interest-free loans are a first-class flag.
 */
export class FinanceAssetsLoans1715000002000 implements MigrationInterface {
  name = 'FinanceAssetsLoans1715000002000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE finance_asset (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(120) NOT NULL,
        type          VARCHAR(24) NOT NULL DEFAULT 'other',
        value         NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency      VARCHAR(3) NOT NULL DEFAULT 'TRY',
        acquired_at   TIMESTAMPTZ,
        color_token   VARCHAR(24),
        icon          VARCHAR(32),
        notes         TEXT,
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_finance_asset_owner ON finance_asset(owner_id)`,
    );

    await qr.query(`
      CREATE TABLE finance_loan (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name                  VARCHAR(160) NOT NULL,
        lender                VARCHAR(160),
        principal_amount      NUMERIC(14,2) NOT NULL,
        installment_count     INTEGER NOT NULL,
        installment_amount    NUMERIC(14,2) NOT NULL,
        interest_rate         NUMERIC(5,2),
        interest_free         BOOLEAN NOT NULL DEFAULT false,
        start_date            TIMESTAMPTZ NOT NULL,
        notify_minutes_before INTEGER,
        currency              VARCHAR(3) NOT NULL DEFAULT 'TRY',
        notes                 TEXT,
        settled_at            TIMESTAMPTZ,
        position              INTEGER NOT NULL DEFAULT 0,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_finance_loan_owner ON finance_loan(owner_id)`,
    );

    await qr.query(`
      CREATE TABLE finance_installment (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        loan_id       BIGINT NOT NULL REFERENCES finance_loan(id) ON DELETE CASCADE,
        sequence      INTEGER NOT NULL,
        amount        NUMERIC(14,2) NOT NULL,
        due_at        TIMESTAMPTZ NOT NULL,
        paid_at       TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(
      `CREATE INDEX idx_finance_installment_owner ON finance_installment(owner_id)`,
    );
    await qr.query(
      `CREATE INDEX idx_finance_installment_loan ON finance_installment(loan_id)`,
    );
    await qr.query(
      `CREATE INDEX idx_finance_installment_owner_due ON finance_installment(owner_id, due_at)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    const tables = ['finance_installment', 'finance_loan', 'finance_asset'];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
