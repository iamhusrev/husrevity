import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Renamed from Spring's `VaultEntity` to `VaultEntry` here to avoid
 * the name clash with the `BaseEntity` superclass we extend.
 * Table name is still `vault_entity` (matches Spring schema).
 */
@Entity('vault_entity')
@Index('idx_vault_entity_owner', ['ownerId'])
export class VaultEntry extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icon!: string | null;

  @Column({ type: 'varchar', length: 16, default: '#6366F1' })
  color!: string;
}
