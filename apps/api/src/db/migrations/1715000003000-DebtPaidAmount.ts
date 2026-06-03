import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds partial-payment tracking to debts: `paid_amount` accumulates payments so
 * the remaining balance is `principal_amount − paid_amount`. Each payment also
 * spawns a matching expense (i_owe) / income (owed_to_me) transaction, handled
 * in the service layer.
 */
export class DebtPaidAmount1715000003000 implements MigrationInterface {
  name = 'DebtPaidAmount1715000003000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE finance_debt ADD COLUMN paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE finance_debt DROP COLUMN IF EXISTS paid_amount`);
  }
}
