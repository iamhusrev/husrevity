import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { numericTransformer } from './finance-account.entity';

/**
 * Something the owner holds with monetary value — cash reserve, property,
 * vehicle, gold, an investment, etc. Unlike `FinanceAccount`, an asset's
 * value is *stored* (manually marked-to-market), not derived from a ledger.
 * Assets feed the net-worth panel (`totalAssets`).
 */
@Entity('finance_asset')
@Index('idx_finance_asset_owner', ['ownerId'])
export class FinanceAsset extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** 'cash' | 'property' | 'vehicle' | 'gold' | 'investment' | 'other' — free-form. */
  @Column({ type: 'varchar', length: 24, default: 'other' })
  type!: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  value!: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ name: 'acquired_at', type: 'timestamptz', nullable: true })
  acquiredAt!: Date | null;

  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
