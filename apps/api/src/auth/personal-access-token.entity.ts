import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/** Scope string, e.g. "items:read". Enforced by PatAuthGuard/@RequireScopes — see mcp/. */
export type PatScope =
  | 'items:read'
  | 'items:write'
  | 'notes:read'
  | 'notes:write'
  | 'projects:read';

@Entity('personal_access_token')
@Index('idx_personal_access_token_owner', ['ownerId'])
export class PersonalAccessToken extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'jsonb', default: '[]' })
  scopes!: PatScope[];

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
}
