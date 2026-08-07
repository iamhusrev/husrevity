import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { ProjectMember, ProjectRole } from './project-member.entity';
import { ApiException } from '../common/api.exception';

const RANK: Record<ProjectRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export interface ProjectAccess {
  project: Project;
  role: ProjectRole;
}

/**
 * The single authorization gate for project + task access. Everything that
 * needs to know "can userId do X on projectId" goes through here — Project
 * and Task services both depend on it instead of re-implementing membership
 * checks.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {}

  /**
   * Throws 404 (not 403) when the caller isn't a member at all — matches the
   * old requireByCode(ownerId, code) behaviour of not leaking a project's
   * existence to non-members. 403 only when they ARE a member but below minRole.
   */
  async requireAccess(
    userId: string,
    projectId: string,
    minRole: ProjectRole = 'VIEWER',
  ): Promise<ProjectAccess> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw ApiException.notFound('Project not found');
    const member = await this.members.findOne({ where: { projectId, userId } });
    if (!member) throw ApiException.notFound('Project not found');
    const role = member.role;
    if (!ProjectAccessService.atLeast(role, minRole)) {
      throw ApiException.forbidden('You do not have permission to do this in this project');
    }
    return { project, role };
  }

  /** Non-throwing variant, used by future phases (e.g. assignee validation). */
  async findAccess(userId: string, projectId: string): Promise<ProjectAccess | null> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) return null;
    const member = await this.members.findOne({ where: { projectId, userId } });
    if (!member) return null;
    return { project, role: member.role };
  }

  /** True if userId has any live membership row on projectId. Used for assignee validation later. */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const member = await this.members.findOne({ where: { projectId, userId } });
    return !!member;
  }

  static atLeast(role: ProjectRole, min: ProjectRole): boolean {
    return RANK[role] >= RANK[min];
  }
}
