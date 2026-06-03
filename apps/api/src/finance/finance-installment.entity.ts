import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { numericTransformer } from './finance-account.entity';

/**
 * A single scheduled installment of a `FinanceLoan`. `paidAt` is NULL until
 * the owner marks it paid; an unpaid installment with a due date drives a
 * notification (kind `finance_installment`, source id = this row's id).
 */
@Entity('finance_installment')
@Index('idx_finance_installment_owner', ['ownerId'])
@Index('idx_finance_installment_loan', ['loanId'])
@Index('idx_finance_installment_owner_due', ['ownerId', 'dueAt'])
export class FinanceInstallment extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'loan_id', type: 'bigint' })
  loanId!: string;

  /** 1-based position within the loan's schedule. */
  @Column({ type: 'integer' })
  sequence!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;
}
