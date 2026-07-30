import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Task } from './task.entity';
import { ProjectService } from '../project/project.service';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import { ReorderItemDto, TaskRequestDto, TaskResponseDto } from './dto/task-dtos';

const TASK_DONE_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED']);

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly projects: ProjectService,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async listForProject(ownerId: string, projectCode: string): Promise<TaskResponseDto[]> {
    const project = await this.projects.requireByCode(ownerId, projectCode);
    const rows = await this.tasks.find({
      where: { ownerId, projectId: project.id },
      order: { position: 'ASC', updatedAt: 'DESC' },
    });
    return rows.map(TaskResponseDto.from);
  }

  async get(ownerId: string, id: string): Promise<TaskResponseDto> {
    return TaskResponseDto.from(await this.requireOwned(ownerId, id));
  }

  async createForProject(
    ownerId: string,
    projectCode: string,
    req: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const project = await this.projects.requireByCode(ownerId, projectCode);
    const t = this.tasks.create({
      ownerId,
      projectId: project.id,
      title: req.title,
      description: req.description ?? null,
      status: req.status ?? 'TODO',
      priority: req.priority ?? 'MEDIUM',
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      position: 0,
    });
    const saved = await this.tasks.save(t);
    await this.syncNotification(saved);
    return TaskResponseDto.from(saved);
  }

  async update(ownerId: string, id: string, req: TaskRequestDto): Promise<TaskResponseDto> {
    const t = await this.requireOwned(ownerId, id);
    t.title = req.title;
    if (req.description !== undefined) t.description = req.description ?? null;
    if (req.status !== undefined) t.status = req.status;
    if (req.priority !== undefined) t.priority = req.priority;
    if (req.dueAt !== undefined) t.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.projectId !== undefined) t.projectId = req.projectId || null;
    if (req.notifyMinutesBefore !== undefined) {
      t.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    const saved = await this.tasks.save(t);
    await this.syncNotification(saved);
    return TaskResponseDto.from(saved);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const t = await this.requireOwned(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'task', t.id);
    await this.tasks.softRemove(t);
  }

  async restore(ownerId: string, id: string): Promise<TaskResponseDto> {
    const t = await this.tasks.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!t || !t.deletedAt) throw ApiException.notFound('Task not found');
    await this.tasks.restore({ id, ownerId });
    const restored = await this.requireOwned(ownerId, id);
    await this.syncNotification(restored);
    return TaskResponseDto.from(restored);
  }

  async reorderForProject(
    ownerId: string,
    projectCode: string,
    items: ReorderItemDto[],
  ): Promise<void> {
    const project = await this.projects.requireByCode(ownerId, projectCode);
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(Task)
          .set({ position: it.position })
          .where('id = :id AND project_id = :projectId AND owner_id = :ownerId', {
            id: it.id,
            projectId: project.id,
            ownerId,
          })
          .execute();
      }
    });
  }

  private async syncNotification(t: Task): Promise<void> {
    await this.notifications.cancelForSource(t.ownerId, 'task', t.id);
    if (TASK_DONE_STATUSES.has(t.status)) return;
    const fireAt = leadTimeFireAt(t.dueAt, t.notifyMinutesBefore);
    if (!fireAt || !t.dueAt) return;
    await this.notifications.enqueue({
      ownerId: t.ownerId,
      kind: 'task',
      sourceId: t.id,
      scheduledAt: fireAt,
      title: t.title,
      body: formatLeadTimeBody(t.dueAt, t.notifyMinutesBefore ?? 0, t.description),
      deepLink: t.projectId ? `/projects` : '/projects',
    });
  }

  private async requireOwned(ownerId: string, id: string): Promise<Task> {
    const t = await this.tasks.findOne({ where: { id, ownerId } });
    if (!t) throw ApiException.notFound('Task not found');
    return t;
  }
}
