import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export const PROJECT_ROLES = ['OWNER', 'EDITOR', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/**
 * Join table between project and app_user. The owner is itself a member row
 * (role='OWNER') so authorization never has to branch on project.owner_id
 * separately — see project-access.service.ts (later phase).
 *
 * Partial-unique constraints live in the migration SQL (TypeORM decorators
 * can't express a WHERE clause): one live row per (project_id, user_id), and
 * at most one live OWNER per project.
 */
@Entity('project_member')
@Index('idx_project_member_user', ['userId'])
@Index('idx_project_member_project', ['projectId'])
export class ProjectMember extends BaseEntity {
  @Column({ name: 'project_id', type: 'bigint' })
  projectId!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ type: 'varchar', length: 16, default: 'EDITOR' })
  role!: ProjectRole;

  @Column({ name: 'invited_by_id', type: 'bigint', nullable: true })
  invitedById!: string | null;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;
}
