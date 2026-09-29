import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Caches a POST/PATCH response by (ownerId, client-supplied key) so a
 * retried request from an offline queue replays the original response
 * instead of re-applying the write. See idempotency.interceptor.ts.
 */
@Entity('idempotency_key')
@Index('idx_idempotency_key_owner_key', ['ownerId', 'key'])
export class IdempotencyKey extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  key!: string;

  @Column({ type: 'varchar', length: 8 })
  method!: string;

  @Column({ type: 'varchar', length: 255 })
  path!: string;

  @Column({ name: 'response_status', type: 'integer' })
  responseStatus!: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody!: unknown;
}
