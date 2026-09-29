import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type DevicePlatform = 'ios' | 'android' | 'web';

@Entity('device')
@Index('idx_device_owner', ['ownerId'])
export class Device extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 16 })
  platform!: DevicePlatform;

  @Column({ name: 'push_token', type: 'varchar', length: 512 })
  pushToken!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;
}
