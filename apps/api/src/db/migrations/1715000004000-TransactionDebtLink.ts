import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a transaction to the debt it pays off, so a debt's payment history can
 * be listed. Nullable — only debt-payment rows carry it; ordinary income /
 * expense / transfer rows leave it NULL.
 */
export class TransactionDebtLink1715000004000 implements MigrationInterface {
  name = 'TransactionDebtLink1715000004000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE finance_transaction ADD COLUMN debt_id BIGINT REFERENCES finance_debt(id) ON DELETE SET NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_finance_transaction_debt ON finance_transaction(owner_id, debt_id)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_finance_transaction_debt`);
    await qr.query(
      `ALTER TABLE finance_transaction DROP COLUMN IF EXISTS debt_id`,
    );
  }
}
