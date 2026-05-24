import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * TypeORM returns NUMERIC as string to preserve precision; we convert to
 * `number` at the entity boundary for ergonomic math, since amounts here
 * never exceed JS safe-integer range (12 integer digits ≪ 2^53).
 */
export const numericTransformer = {
  to: (v: number | null | undefined): number | null =>
    v === null || v === undefined ? null : Number(v),
  from: (v: string | null): number =>
    v === null || v === undefined ? 0 : Number(v),
};

/**
 * A place money lives — bank account, credit card, cash wallet, savings.
 * Balance is *derived* (opening_balance + Σ inflows − Σ outflows), never
 * stored, so the ledger stays the single source of truth.
 */
@Entity('finance_account')
@Index('idx_finance_account_owner', ['ownerId'])
export class FinanceAccount extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** 'bank' | 'card' | 'cash' | 'savings' — free-form for future-proofing. */
  @Column({ type: 'varchar', length: 16, default: 'bank' })
  type!: string;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({
    name: 'opening_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  openingBalance!: number;

  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon!: string | null;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
