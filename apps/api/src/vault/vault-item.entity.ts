import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('vault_item')
@Index('idx_vault_item_entity', ['entityId'])
@Index('idx_vault_item_owner', ['ownerId'])
export class VaultItem extends BaseEntity {
  @Column({ name: 'entity_id', type: 'bigint' })
  entityId!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({ name: 'encrypted_value', type: 'text' })
  encryptedValue!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;
}
