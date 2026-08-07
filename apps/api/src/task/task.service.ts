import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Task } from './task.entity';
import { ProjectAccessService } from '../project/project-access.service';
import { ProjectInviteService } from '../project/project-invite.service';
import { ProjectRole } from '../project/project-member.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { MailerService } from '../notification/mailer.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
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
    private readonly access: ProjectAccessService,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly users: UserService,
    private readonly mailer: MailerService,
    private readonly projectInvites: ProjectInviteService,
  ) {}

  async listForProject(userId: string, projectId: string): Promise<TaskResponseDto[]> {
    const { project } = await this.access.requireAccess(userId, projectId, 'VIEWER');
    const rows = await this.tasks.find({
      where: { projectId: project.id },
      order: { position: 'ASC', updatedAt: 'DESC' },
    });
    const nameMap = await this.resolveAssigneeNames(rows);
    return rows.map((t) =>
      TaskResponseDto.from(t, t.assigneeId ? (nameMap.get(t.assigneeId) ?? null) : null),
    );
  }

  async get(userId: string, id: string): Promise<TaskResponseDto> {
    const t = await this.requireTaskAccess(userId, id, 'VIEWER');
    const assigneeName = t.assigneeId ? await this.resolveAssigneeName(t.assigneeId) : null;
    return TaskResponseDto.from(t, assigneeName);
  }

  async createForProject(
    userId: string,
    projectId: string,
    req: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const { project } = await this.access.requireAccess(userId, projectId, 'EDITOR');
    await this.validateAssignee(project.id, req.assigneeId);
    const t = this.tasks.create({
      ownerId: project.ownerId,
      projectId: project.id,
      title: req.title,
      description: req.description ?? null,
      status: req.status ?? 'TODO',
      priority: req.priority ?? 'MEDIUM',
      dueAt: req.dueAt ? new Date(req.dueAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      assigneeId: req.assigneeId ?? null,
      position: 0,
    });
    const saved = await this.tasks.save(t);
    await this.syncNotification(saved);
    const assigneeName = saved.assigneeId
      ? await this.resolveAssigneeName(saved.assigneeId)
      : null;
    return TaskResponseDto.from(saved, assigneeName);
  }

  async update(
    userId: string,
    actorEmail: string,
    id: string,
    req: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const t = await this.requireTaskAccess(userId, id, 'EDITOR');
    const previousAssigneeId = t.assigneeId;
    t.title = req.title;
    if (req.description !== undefined) t.description = req.description ?? null;
    if (req.status !== undefined) t.status = req.status;
    if (req.priority !== undefined) t.priority = req.priority;
    if (req.dueAt !== undefined) t.dueAt = req.dueAt ? new Date(req.dueAt) : null;
    if (req.projectId !== undefined && req.projectId !== t.projectId) {
      if (req.projectId) {
        const target = await this.access.requireAccess(userId, req.projectId, 'EDITOR');
        t.projectId = target.project.id;
        t.ownerId = target.project.ownerId;
        // The task is moving to a different project. If the caller isn't
        // also explicitly setting assigneeId in this same request (handled
        // below), any existing assignee must still be re-validated against
        // the TARGET project — an assignee who was a member of the old
        // project has no guarantee of being a member of the new one, and a
        // stale cross-project assignee would violate the invariant every
        // other call site enforces.
        if (req.assigneeId === undefined && t.assigneeId) {
          const stillValid = await this.access.isMember(t.projectId, t.assigneeId);
          if (!stillValid) t.assigneeId = null;
        }
      } else {
        t.projectId = null;
        // Moving to "no project" (personal task) — re-anchor ownership to the acting user.
        t.ownerId = userId;
        // Personal tasks can't have an assignee — sharing is project-scoped only.
        t.assigneeId = null;
      }
    }
    if (req.assigneeId !== undefined) {
      if (!t.projectId) {
        if (req.assigneeId) {
          throw ApiException.badRequest('Only tasks inside a project can be assigned');
        }
        t.assigneeId = null;
      } else {
        await this.validateAssignee(t.projectId, req.assigneeId);
        t.assigneeId = req.assigneeId ?? null;
      }
    }
    if (req.notifyMinutesBefore !== undefined) {
      t.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    const saved = await this.tasks.save(t);
    await this.syncNotification(saved, previousAssigneeId);

    let assigneeUser: User | null = null;
    if (saved.assigneeId) {
      assigneeUser = await this.users.findById(saved.assigneeId);
    }
    const assigneeName = assigneeUser ? TaskService.displayName(assigneeUser) : null;

    const assignmentChanged =
      req.assigneeId !== undefined &&
      req.assigneeId !== previousAssigneeId &&
      !!saved.assigneeId &&
      saved.assigneeId !== userId;
    if (
      assignmentChanged &&
      assigneeUser &&
      saved.projectId &&
      this.mailer.isConfigured() &&
      assigneeUser.emailNotificationsEnabled
    ) {
      const projectAccess = await this.access.findAccess(userId, saved.projectId);
      if (projectAccess) {
        await this.mailer.sendTaskAssignedEmail(
          assigneeUser.email,
          projectAccess.project.name,
          saved.title,
          actorEmail,
          this.projectInvites.buildProjectUrl(saved.projectId),
        );
      }
    }

    return TaskResponseDto.from(saved, assigneeName);
  }

  async delete(userId: string, id: string): Promise<void> {
    const t = await this.requireTaskAccess(userId, id, 'EDITOR');
    // A collaborator's own reminder for a task they're assigned to must not
    // survive its deletion, so cancel for both the owner and the assignee.
    for (const uid of new Set([t.ownerId, t.assigneeId].filter((x): x is string => !!x))) {
      await this.notifications.cancelForSource(uid, 'task', t.id);
    }
    await this.tasks.softRemove(t);
  }

  async restore(userId: string, id: string): Promise<TaskResponseDto> {
    const t = await this.tasks.findOne({ where: { id }, withDeleted: true });
    if (!t || !t.deletedAt) throw ApiException.notFound('Task not found');
    if (t.projectId) {
      // A task can't be restored into a project that's itself soft-deleted —
      // requireAccess looks up the live (non-withDeleted) project.
      await this.access.requireAccess(userId, t.projectId, 'EDITOR');
    } else if (t.ownerId !== userId) {
      throw ApiException.notFound('Task not found');
    }
    await this.tasks.restore({ id });
    const restored = await this.requireTaskAccess(userId, id, 'VIEWER');
    await this.syncNotification(restored);
    const assigneeName = restored.assigneeId
      ? await this.resolveAssigneeName(restored.assigneeId)
      : null;
    return TaskResponseDto.from(restored, assigneeName);
  }

  async reorderForProject(
    userId: string,
    projectId: string,
    items: ReorderItemDto[],
  ): Promise<void> {
    const { project } = await this.access.requireAccess(userId, projectId, 'EDITOR');
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(Task)
          .set({ position: it.position })
          .where('id = :id AND project_id = :projectId', {
            id: it.id,
            projectId: project.id,
          })
          .execute();
      }
    });
  }

  /** Throws 400 unless `assigneeId` is null/undefined or a live member of `projectId`. */
  private async validateAssignee(
    projectId: string,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeId) return;
    const isMember = await this.access.isMember(projectId, assigneeId);
    if (!isMember) throw ApiException.badRequest('The assignee must be a member of this project');
  }

  private async resolveAssigneeName(assigneeId: string): Promise<string | null> {
    const u = await this.users.findById(assigneeId);
    return u ? TaskService.displayName(u) : null;
  }

  /** Batch-resolves assignee display names for a list of tasks in one query — avoids N+1. */
  private async resolveAssigneeNames(rows: Task[]): Promise<Map<string, string>> {
    const ids = Array.from(new Set(rows.map((r) => r.assigneeId).filter((x): x is string => !!x)));
    const nameMap = new Map<string, string>();
    if (ids.length === 0) return nameMap;
    const users: Array<{ id: string; first_name: string | null; last_name: string | null; email: string }> =
      await this.dataSource.query(
        'SELECT id, first_name, last_name, email FROM app_user WHERE id = ANY($1::bigint[])',
        [ids],
      );
    for (const u of users) {
      nameMap.set(String(u.id), TaskService.displayName({
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
      } as User));
    }
    return nameMap;
  }

  private static displayName(u: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return name || u.email;
  }

  private async syncNotification(t: Task, previousAssigneeId?: string | null): Promise<void> {
    const staleRecipients = new Set(
      [t.ownerId, t.assigneeId, previousAssigneeId].filter((x): x is string => !!x),
    );
    for (const uid of staleRecipients) {
      await this.notifications.cancelForSource(uid, 'task', t.id);
    }
    if (TASK_DONE_STATUSES.has(t.status)) return;
    const fireAt = leadTimeFireAt(t.dueAt, t.notifyMinutesBefore);
    if (!fireAt || !t.dueAt) return;
    await this.notifications.enqueue({
      ownerId: t.assigneeId ?? t.ownerId,
      kind: 'task',
      sourceId: t.id,
      scheduledAt: fireAt,
      title: t.title,
      body: formatLeadTimeBody(t.dueAt, t.notifyMinutesBefore ?? 0, t.description),
      deepLink: t.projectId ? `/projects/${t.projectId}` : '/projects',
    });
  }

  /**
   * Task-level access gate. A task with projectId === null is a personal
   * task and stays strictly owner-scoped — sharing is project-scoped only.
   * A project task defers to project membership via ProjectAccessService.
   */
  private async requireTaskAccess(
    userId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<Task> {
    const t = await this.tasks.findOne({ where: { id } });
    if (!t) throw ApiException.notFound('Task not found');
    if (!t.projectId) {
      if (t.ownerId !== userId) throw ApiException.notFound('Task not found');
      return t;
    }
    await this.access.requireAccess(userId, t.projectId, minRole);
    return t;
  }
}
