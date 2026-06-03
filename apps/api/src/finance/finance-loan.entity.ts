import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { numericTransformer } from './finance-account.entity';

/**
 * An installment liability — a bank loan or an installment purchase
 * ("taksitli alışveriş"). The owner prefers interest-free options, so
 * `interestFree` is a first-class flag (UI highlights/filters by it; a 0%
 * `interestRate` is treated as interest-free too).
 *
 * The repayment plan lives in `FinanceInstallment` rows (one per installment),
 * generated on create. Progress (paid/remaining) is *derived* from those rows;
 * `settledAt` is set when the last installment is paid.
 */
@Entity('finance_loan')
@Index('idx_finance_loan_owner', ['ownerId'])
export class FinanceLoan extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  /** Bank or store the loan/purchase is with. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  lender!: string | null;

  @Column({
    name: 'principal_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  principalAmount!: number;

  @Column({ name: 'installment_count', type: 'integer' })
  installmentCount!: number;

  @Column({
    name: 'installment_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  installmentAmount!: number;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  interestRate!: number | null;

  @Column({ name: 'interest_free', type: 'boolean', default: false })
  interestFree!: boolean;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  /** Notification lead-time in minutes applied to each installment due date. */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
