import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Project } from './project.entity';
import { ProjectMember, ProjectRole } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { ApiException } from '../common/api.exception';
import { ProjectRequestDto, ProjectResponseDto, ProjectUpdateRequestDto } from './dto/project-dtos';

type ProjectListFilter = 'all' | 'mine' | 'shared';

interface ProjectListRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: Date;
  created_by_id: string | null;
  updated_at: Date;
  updated_by_id: string | null;
  deleted_at: Date | null;
  owner_id: string;
  my_role: ProjectRole;
  member_count: string | number;
  owner_first_name: string | null;
  owner_last_name: string | null;
}

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly access: ProjectAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: string, filter?: ProjectListFilter): Promise<ProjectResponseDto[]> {
    const rows: ProjectListRow[] = await this.dataSource.query(
      `SELECT p.*, m.role AS my_role, mc.cnt AS member_count,
              o.first_name AS owner_first_name, o.last_name AS owner_last_name
       FROM project p
       JOIN project_member m ON m.project_id = p.id AND m.user_id = $1 AND m.deleted_at IS NULL
       JOIN app_user o ON o.id = p.owner_id
       LEFT JOIN (SELECT project_id, COUNT(*) cnt FROM project_member WHERE deleted_at IS NULL GROUP BY project_id) mc
         ON mc.project_id = p.id
       WHERE p.deleted_at IS NULL
         AND ($2::text IS NULL OR ($2 = 'mine' AND p.owner_id = $1) OR ($2 = 'shared' AND p.owner_id <> $1))
       ORDER BY p.pinned DESC, p.updated_at DESC`,
      [userId, filter ?? null],
    );
    return rows.map((row) => this.mapListRow(row));
  }

  /** Same as the old owner-scoped list() — used by AiSuggestionService, which must never see shared projects. */
  async listOwned(userId: string): Promise<ProjectResponseDto[]> {
    const rows = await this.projects.find({
      where: { ownerId: userId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((p) => ProjectResponseDto.from(p, { role: 'OWNER', memberCount: 1, ownerName: null }));
  }

  async getById(userId: string, projectId: string): Promise<ProjectResponseDto> {
    const { project, role } = await this.access.requireAccess(userId, projectId);
    const memberCount = await this.countMembers(projectId);
    const ownerName = await this.ownerName(project.ownerId);
    return ProjectResponseDto.from(project, { role, memberCount, ownerName });
  }

  async create(ownerId: string, req: ProjectRequestDto): Promise<ProjectResponseDto> {
    // `uq_project_owner_code_live` (migration 1715000018000) scopes
    // uniqueness to live rows only, so a plain (soft-delete-excluding) find
    // is the right pre-check — a soft-deleted project's code is free to
    // reuse and no longer collides here.
    const exists = await this.projects.findOne({ where: { ownerId, code: req.code } });
    if (exists) {
      throw ApiException.conflict(`Project code "${req.code}" already exists`);
    }

    const saved = await this.dataSource.transaction(async (em) => {
      const p = em.getRepository(Project).create({
        ownerId,
        code: req.code,
        name: req.name,
        description: req.description ?? null,
        status: req.status ?? 'ACTIVE',
        startDate: req.startDate ?? null,
        endDate: req.endDate ?? null,
      });
      const savedProject = await em.getRepository(Project).save(p);
      const member = em.getRepository(ProjectMember).create({
        projectId: savedProject.id,
        userId: ownerId,
        role: 'OWNER',
        joinedAt: new Date(),
      });
      await em.getRepository(ProjectMember).save(member);
      return savedProject;
    });

    return ProjectResponseDto.from(saved, { role: 'OWNER', memberCount: 1, ownerName: null });
  }

  async update(
    userId: string,
    projectId: string,
    req: ProjectUpdateRequestDto,
  ): Promise<ProjectResponseDto> {
    const { project: p, role } = await this.access.requireAccess(userId, projectId, 'EDITOR');
    if (req.archived !== undefined && role !== 'OWNER') {
      throw ApiException.forbidden('Only the project owner can archive this project');
    }
    if (req.name !== undefined) p.name = req.name;
    if (req.description !== undefined) p.description = req.description ?? null;
    if (req.status !== undefined) p.status = req.status;
    if (req.startDate !== undefined) p.startDate = req.startDate ?? null;
    if (req.endDate !== undefined) p.endDate = req.endDate ?? null;
    if (req.pinned !== undefined) p.pinned = req.pinned;
    if (req.archived !== undefined) p.archived = req.archived;
    const saved = await this.projects.save(p);
    const memberCount = await this.countMembers(projectId);
    const ownerName = await this.ownerName(saved.ownerId);
    return ProjectResponseDto.from(saved, { role, memberCount, ownerName });
  }

  async delete(userId: string, projectId: string): Promise<void> {
    const { project } = await this.access.requireAccess(userId, projectId, 'OWNER');
    await this.projects.softRemove(project);
  }

  async restore(userId: string, projectId: string): Promise<ProjectResponseDto> {
    // Deliberately bypasses ProjectAccessService — a collaborator must not be
    // able to resurrect a project the owner deleted. Restore is owner-only.
    const p = await this.projects.findOne({ where: { id: projectId }, withDeleted: true });
    if (!p || !p.deletedAt || p.ownerId !== userId) {
      throw ApiException.notFound('Project not found');
    }
    try {
      await this.projects.restore({ id: p.id, ownerId: userId });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw ApiException.conflict('A project with this code already exists — cannot restore');
      }
      throw e;
    }
    const restored = await this.projects.findOneOrFail({ where: { id: projectId } });
    const memberCount = await this.countMembers(projectId);
    const ownerName = await this.ownerName(restored.ownerId);
    return ProjectResponseDto.from(restored, { role: 'OWNER', memberCount, ownerName });
  }

  private mapListRow(row: ProjectListRow): ProjectResponseDto {
    const project: Project = {
      id: row.id,
      ownerId: row.owner_id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      pinned: row.pinned,
      archived: row.archived,
      createdAt: row.created_at,
      createdById: row.created_by_id,
      updatedAt: row.updated_at,
      updatedById: row.updated_by_id,
      deletedAt: row.deleted_at,
    };
    const ownerName =
      [row.owner_first_name, row.owner_last_name].filter(Boolean).join(' ') || null;
    return ProjectResponseDto.from(project, {
      role: row.my_role,
      memberCount: Number(row.member_count ?? 1),
      ownerName,
    });
  }

  private async countMembers(projectId: string): Promise<number> {
    return this.members.count({ where: { projectId } });
  }

  private async ownerName(ownerId: string): Promise<string | null> {
    const owner: { first_name: string | null; last_name: string | null }[] =
      await this.dataSource.query(
        `SELECT first_name, last_name FROM app_user WHERE id = $1`,
        [ownerId],
      );
    if (!owner.length) return null;
    return [owner[0].first_name, owner[0].last_name].filter(Boolean).join(' ') || null;
  }
}
