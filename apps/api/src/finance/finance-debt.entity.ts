import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { numericTransformer } from './finance-account.entity';

export type FinanceDebtDirection = 'owed_to_me' | 'i_owe';

/**
 * Money owed: `direction = 'owed_to_me'` is when somebody else owes me;
 * `'i_owe'` is when I owe somebody. Settled debts keep their row (audit
 * trail) but get a `settled_at` timestamp and stop generating notifications.
 */
@Entity('finance_debt')
@Index('idx_finance_debt_owner', ['ownerId'])
@Index('idx_finance_debt_owner_due', ['ownerId', 'dueAt'])
export class FinanceDebt extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 16 })
  direction!: FinanceDebtDirection;

  @Column({ type: 'varchar', length: 160 })
  counterparty!: string;

  @Column({
    name: 'principal_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  principalAmount!: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  interestRate!: number | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  /** Notification lead-time in minutes (NULL = no notification fires). */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
