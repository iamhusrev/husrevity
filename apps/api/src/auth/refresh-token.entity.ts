import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refresh_token')
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 128, unique: true })
  tokenHash!: string;

  @Index('idx_refresh_token_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: false })
  revoked!: boolean;

  /**
   * Shared by every token descended from the same login/register through
   * successive rotations. Reuse of a revoked token (auth.service.ts's
   * refresh()) revokes every live token sharing this value — the classic
   * stolen-refresh-token defense.
   */
  @Index('idx_refresh_token_family_id')
  @Column({ name: 'family_id', type: 'varchar', length: 64 })
  familyId!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
