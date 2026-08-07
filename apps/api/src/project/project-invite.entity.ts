import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import type { ProjectRole } from './project-member.entity';

/**
 * Token-based invite to join a project, for both registered and
 * unregistered emails. Mirrors admin/user-invite.entity.ts: only the
 * SHA-256 hash of the plaintext token is stored, TTL via expires_at,
 * acceptance tracked via accepted_at/accepted_user_id.
 *
 * role only allows 'EDITOR' | 'VIEWER' at the DB level (ck_project_invite_role)
 * — an invite can never grant OWNER. Typed as ProjectRole here for
 * simplicity; the EDITOR/VIEWER subset is enforced by business logic and the
 * migration's CHECK constraint, not by the TS type.
 */
@Entity('project_invite')
@Index('idx_project_invite_project', ['projectId'])
export class ProjectInvite extends BaseEntity {
  @Column({ name: 'project_id', type: 'bigint' })
  projectId!: string;

  @Column({ name: 'invited_by_id', type: 'bigint' })
  invitedById!: string;

  @Column({ type: 'varchar', length: 160 })
  email!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'EDITOR' })
  role!: ProjectRole;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'accepted_user_id', type: 'bigint', nullable: true })
  acceptedUserId!: string | null;
}
