import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('outbox_events')
@Index('idx_outbox_events_unprocessed', ['createdAt'])
export class OutboxEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
