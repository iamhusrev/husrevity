import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the reading, finance, plan, and lists features.
 * 
 * (a) This migration is irreversible by design. The data is gone either way, the code
 * that used these tables is also gone, and the DDL is scattered across 7 source
 * migrations plus several ALTER-added columns. Transcribing it back is itself an
 * error-prone exercise for zero benefit.
 * 
 * (b) If anyone ever needs to reconstruct the schema, the original CREATE TABLE
 * statements can be found in:
 * - 1715000000000-Baseline.ts
 * - 1715000002000-FinanceAssetsLoans.ts
 * - 1715000003000-DebtPaidAmount.ts
 * - 1715000004000-TransactionDebtLink.ts
 * - 1715000006000-AddListSections.ts
 * - 1715000007000-AddReadingTracker.ts
 * - 1715000008000-AddReadingTrackCadence.ts
 * 
 * (c) The repo owner must take a pg_dump backup BEFORE running this migration:
 * docker exec shared-postgres pg_dump -U postgres husrevity > ~/husrevity-pre-strip.sql
 */
export class DropReadingFinancePlanList1715000017000 implements MigrationInterface {
  name = 'DropReadingFinancePlanList1715000017000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM notification WHERE kind IN ('list_item','debt','finance_installment')`);

    await qr.query(`DROP TABLE IF EXISTS list_item`);
    await qr.query(`DROP TABLE IF EXISTS list_section`);
    await qr.query(`DROP TABLE IF EXISTS todo_list`);

    await qr.query(`DROP TABLE IF EXISTS reading_log`);
    await qr.query(`DROP TABLE IF EXISTS reading_track`);

    await qr.query(`DROP TABLE IF EXISTS plan_item`);
    await qr.query(`DROP TABLE IF EXISTS plan`);

    await qr.query(`DROP TABLE IF EXISTS finance_installment`);
    await qr.query(`DROP TABLE IF EXISTS finance_transaction`);
    await qr.query(`DROP TABLE IF EXISTS finance_loan`);
    await qr.query(`DROP TABLE IF EXISTS finance_debt`);
    await qr.query(`DROP TABLE IF EXISTS finance_asset`);
    await qr.query(`DROP TABLE IF EXISTS finance_category`);
    await qr.query(`DROP TABLE IF EXISTS finance_account`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    throw new Error(
      'This migration is irreversible by design. Recovery requires restoring from a pg_dump backup taken before the migration ran.',
    );
  }
}
