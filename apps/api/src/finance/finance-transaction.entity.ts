import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { numericTransformer } from './finance-account.entity';

export type FinanceTransactionKind = 'income' | 'expense' | 'transfer';

/**
 * Atomic money movement. Transfers between two of the user's own accounts
 * are stored as **two** rows (one expense on source, one income on
 * destination), linked via `transfer_pair_id`. The service layer creates and
 * deletes them atomically inside a TypeORM transaction so a half-transfer is
 * impossible.
 */
@Entity('finance_transaction')
@Index('idx_finance_transaction_owner', ['ownerId'])
@Index('idx_finance_transaction_owner_occurred', ['ownerId', 'occurredAt'])
@Index('idx_finance_transaction_account', ['accountId'])
export class FinanceTransaction extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'account_id', type: 'bigint' })
  accountId!: string;

  @Column({ name: 'category_id', type: 'bigint', nullable: true })
  categoryId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: FinanceTransactionKind;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** For transfers: the id of the paired row on the other account. */
  @Column({ name: 'transfer_pair_id', type: 'bigint', nullable: true })
  transferPairId!: string | null;

  /** Set when this row is a payment against a debt — links it to that debt. */
  @Column({ name: 'debt_id', type: 'bigint', nullable: true })
  debtId!: string | null;
}
