import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { ApiException } from '../common/api.exception';
import { ProjectRequestDto, ProjectResponseDto, ProjectUpdateRequestDto } from './dto/project-dtos';

@Injectable()
export class ProjectService {
  constructor(@InjectRepository(Project) private readonly projects: Repository<Project>) {}

  async list(ownerId: string): Promise<ProjectResponseDto[]> {
    const rows = await this.projects.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map(ProjectResponseDto.from);
  }

  async getByCode(ownerId: string, code: string): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.requireByCode(ownerId, code));
  }

  async create(ownerId: string, req: ProjectRequestDto): Promise<ProjectResponseDto> {
    const exists = await this.projects.findOne({
      where: { ownerId, code: req.code },
      withDeleted: true,
    });
    if (exists) {
      if (exists.deletedAt) {
        throw ApiException.conflict(
          `Project code "${req.code}" belongs to a previously deleted project — restore it instead of creating a new one`,
        );
      }
      throw ApiException.conflict(`Project code "${req.code}" already exists`);
    }
    const p = this.projects.create({
      ownerId,
      code: req.code,
      name: req.name,
      description: req.description ?? null,
      status: req.status ?? 'ACTIVE',
      startDate: req.startDate ?? null,
      endDate: req.endDate ?? null,
    });
    return ProjectResponseDto.from(await this.projects.save(p));
  }

  async update(
    ownerId: string,
    code: string,
    req: ProjectUpdateRequestDto,
  ): Promise<ProjectResponseDto> {
    const p = await this.requireByCode(ownerId, code);
    if (req.name !== undefined) p.name = req.name;
    if (req.description !== undefined) p.description = req.description ?? null;
    if (req.status !== undefined) p.status = req.status;
    if (req.startDate !== undefined) p.startDate = req.startDate ?? null;
    if (req.endDate !== undefined) p.endDate = req.endDate ?? null;
    if (req.pinned !== undefined) p.pinned = req.pinned;
    if (req.archived !== undefined) p.archived = req.archived;
    return ProjectResponseDto.from(await this.projects.save(p));
  }

  async delete(ownerId: string, code: string): Promise<void> {
    const p = await this.requireByCode(ownerId, code);
    await this.projects.softRemove(p);
  }

  async restore(ownerId: string, code: string): Promise<ProjectResponseDto> {
    const p = await this.projects.findOne({ where: { ownerId, code }, withDeleted: true });
    if (!p || !p.deletedAt) throw ApiException.notFound(`Project "${code}" not found`);
    try {
      await this.projects.restore({ id: p.id, ownerId });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw ApiException.conflict(
          'A project with this code already exists — cannot restore',
        );
      }
      throw e;
    }
    return ProjectResponseDto.from(await this.requireByCode(ownerId, code));
  }

  async requireByCode(ownerId: string, code: string): Promise<Project> {
    const p = await this.projects.findOne({ where: { ownerId, code } });
    if (!p) throw ApiException.notFound(`Project "${code}" not found`);
    return p;
  }
}
