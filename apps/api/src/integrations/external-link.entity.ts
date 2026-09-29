import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Item } from '../item/item.entity';

export type ExternalLinkProvider = 'google_calendar';

@Entity('external_link')
@Index('idx_external_link_item', ['itemId'])
@Index('idx_external_link_provider_external_id', ['provider', 'externalId'])
export class ExternalLink extends BaseEntity {
  @Column({ name: 'item_id', type: 'bigint' })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: Item;

  @Column({ type: 'varchar', length: 64 })
  provider!: ExternalLinkProvider;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag!: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;
}
