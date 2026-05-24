import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type FinanceCategoryKind = 'income' | 'expense';

/**
 * Income/expense category for ledger entries. Owner-scoped, name+kind unique
 * within an owner so "Yemek" expense and "Yemek" income (e.g. catering side
 * income) can co-exist if needed.
 */
@Entity('finance_category')
@Index('idx_finance_category_owner', ['ownerId'])
export class FinanceCategory extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: FinanceCategoryKind;

  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
