import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Admin-issued invite to onboard a new user. The plaintext token is sent in
 * the email link; we store only its SHA-256 hash. Lifecycle:
 *
 *   created (admin POSTs /api/admin/invites)
 *     → mailer fires off the link
 *     → recipient visits /invite/<token>, sets a password
 *     → POST /api/auth/invite/<token>/accept creates the user, marks
 *       accepted_at + accepted_user_id, returns JWT tokens
 *
 * Expired or accepted invites are filtered out at lookup; admin can also
 * soft-delete via DELETE /api/admin/invites/:id.
 */
@Entity('user_invite')
@Index('idx_user_invite_invited_by', ['invitedById'])
export class UserInvite extends BaseEntity {
  @Column({ name: 'invited_by_id', type: 'bigint' })
  invitedById!: string;

  @Column({ type: 'varchar', length: 160 })
  email!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 80, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 80, nullable: true })
  lastName!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'accepted_user_id', type: 'bigint', nullable: true })
  acceptedUserId!: string | null;
}
