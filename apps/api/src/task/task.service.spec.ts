import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TaskService } from './task.service';
import { Task } from './task.entity';
import { TaskRequestDto } from './dto/task-dtos';
import { ApiException } from '../common/api.exception';
import { ProjectAccessService } from '../project/project-access.service';
import { ProjectInviteService } from '../project/project-invite.service';
import { NotificationService } from '../notification/notification.service';
import { UserService } from '../user/user.service';
import { MailerService } from '../notification/mailer.service';

type MockTaskRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
};

type MockAccessService = {
  requireAccess: jest.Mock;
  findAccess: jest.Mock;
  isMember: jest.Mock;
};

type MockQueryBuilder = {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
};

function makeQueryBuilder(): MockQueryBuilder {
  const qb: Partial<MockQueryBuilder> = {};
  qb.update = jest.fn().mockReturnValue(qb);
  qb.set = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.execute = jest.fn().mockResolvedValue(undefined);
  return qb as MockQueryBuilder;
}

describe('TaskService', () => {
  const ownerId = '1';
  const actorEmail = 'owner@example.com';

  let service: TaskService;
  let tasks: MockTaskRepo;
  let access: MockAccessService;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let users: { findById: jest.Mock; requireById: jest.Mock };
  let mailer: { isConfigured: jest.Mock; sendTaskAssignedEmail: jest.Mock };
  let projectInvites: { buildProjectUrl: jest.Mock };
  let qb: MockQueryBuilder;
  let em: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    tasks = {
      findOne: jest.fn(),
      restore: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };
    access = { requireAccess: jest.fn(), findAccess: jest.fn(), isMember: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    users = { findById: jest.fn().mockResolvedValue(null), requireById: jest.fn() };
    mailer = { isConfigured: jest.fn().mockReturnValue(false), sendTaskAssignedEmail: jest.fn() };
    projectInvites = { buildProjectUrl: jest.fn().mockReturnValue('http://localhost:3090/projects/5') };
    qb = makeQueryBuilder();
    em = { createQueryBuilder: jest.fn(() => qb) };
    dataSource = {
      transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => cb(em)),
      query: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: getRepositoryToken(Task), useValue: tasks },
        { provide: ProjectAccessService, useValue: access },
        { provide: ProjectInviteService, useValue: projectInvites },
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationService, useValue: notifications },
        { provide: UserService, useValue: users },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = module.get(TaskService);
  });

  describe('listForProject', () => {
    it('requires VIEWER access and queries tasks by projectId without an ownerId filter', async () => {
      const project = { id: '5', ownerId: '2' };
      access.requireAccess.mockResolvedValueOnce({ project, role: 'VIEWER' });
      tasks.find.mockResolvedValueOnce([]);

      await service.listForProject(ownerId, '5');

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'VIEWER');
      expect(tasks.find).toHaveBeenCalledWith({
        where: { projectId: project.id },
        order: { position: 'ASC', updatedAt: 'DESC' },
      });
      const whereArg = tasks.find.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('ownerId');
    });
  });

  describe('personal (unassigned) task access', () => {
    it('a personal task (projectId null) owned by a different user is not-found and never touches ProjectAccessService', async () => {
      const t = { id: '30', ownerId: '999', projectId: null } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);

      await expect(service.get(ownerId, '30')).rejects.toMatchObject({ status: 404 });
      expect(access.requireAccess).not.toHaveBeenCalled();
    });
  });

  describe('access failures propagate uncaught', () => {
    const forbidden = ApiException.forbidden('nope');

    it('createForProject does not swallow a forbidden rejection', async () => {
      access.requireAccess.mockRejectedValueOnce(forbidden);

      await expect(
        service.createForProject(ownerId, '5', { title: 'x' } as TaskRequestDto),
      ).rejects.toBe(forbidden);
      expect(tasks.save).not.toHaveBeenCalled();
    });

    it('update does not swallow a forbidden rejection', async () => {
      const t = { id: '30', ownerId, projectId: '5' } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockRejectedValueOnce(forbidden);

      await expect(
        service.update(ownerId, actorEmail, '30', { title: 'x' } as TaskRequestDto),
      ).rejects.toBe(forbidden);
      expect(tasks.save).not.toHaveBeenCalled();
    });

    it('delete does not swallow a forbidden rejection', async () => {
      const t = { id: '30', ownerId, projectId: '5' } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockRejectedValueOnce(forbidden);

      await expect(service.delete(ownerId, '30')).rejects.toBe(forbidden);
      expect(tasks.softRemove).not.toHaveBeenCalled();
    });

    it('reorderForProject does not swallow a forbidden rejection', async () => {
      access.requireAccess.mockRejectedValueOnce(forbidden);

      await expect(
        service.reorderForProject(ownerId, '5', [{ id: '1', position: 0 }]),
      ).rejects.toBe(forbidden);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('createForProject', () => {
    it('creates a task anchored to the project owner, defaulting status/priority', async () => {
      const project = { id: '5', ownerId: '2' };
      access.requireAccess.mockResolvedValueOnce({ project, role: 'EDITOR' });
      const created = {
        id: '40',
        projectId: '5',
        ownerId: '2',
        title: 'New task',
        status: 'TODO',
        priority: 'MEDIUM',
        dueAt: null,
        notifyMinutesBefore: null,
        position: 0,
        description: null,
      } as unknown as Task;
      tasks.create.mockReturnValue(created);
      tasks.save.mockResolvedValue(created);

      const result = await service.createForProject(ownerId, '5', {
        title: 'New task',
      } as TaskRequestDto);

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'EDITOR');
      expect(tasks.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: '2', projectId: '5', status: 'TODO', priority: 'MEDIUM' }),
      );
      expect(notifications.cancelForSource).toHaveBeenCalledWith('2', 'task', '40');
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(result.id).toBe('40');
    });

    it('schedules a lead-time notification when dueAt + notifyMinutesBefore are both set', async () => {
      const project = { id: '5', ownerId: '2' };
      access.requireAccess.mockResolvedValueOnce({ project, role: 'EDITOR' });
      const dueAt = new Date(Date.now() + 3_600_000);
      const created = {
        id: '41',
        projectId: '5',
        ownerId: '2',
        title: 'With due date',
        status: 'TODO',
        priority: 'MEDIUM',
        dueAt,
        notifyMinutesBefore: 15,
        position: 0,
        description: null,
      } as unknown as Task;
      tasks.create.mockReturnValue(created);
      tasks.save.mockResolvedValue(created);

      await service.createForProject(ownerId, '5', {
        title: 'With due date',
        dueAt: dueAt.toISOString(),
        notifyMinutesBefore: 15,
      } as TaskRequestDto);

      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: '2', kind: 'task', sourceId: '41', deepLink: '/projects/5' }),
      );
    });
  });

  describe('update', () => {
    it('rejects when moving a task to a project the caller cannot access, without saving', async () => {
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess
        .mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' }) // requireTaskAccess on current project
        .mockRejectedValueOnce(ApiException.forbidden('nope')); // target project the move is denied on

      await expect(
        service.update(ownerId, actorEmail, '30', { title: 'Old', projectId: '9' } as TaskRequestDto),
      ).rejects.toMatchObject({ status: 403 });

      expect(tasks.save).not.toHaveBeenCalled();
    });

    it('re-anchors ownerId to the target project owner when the move is allowed', async () => {
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      const targetProject = { id: '9', ownerId: '777' };
      access.requireAccess
        .mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' })
        .mockResolvedValueOnce({ project: targetProject, role: 'EDITOR' });
      tasks.save.mockImplementation((task) => Promise.resolve(task));

      await service.update(ownerId, actorEmail, '30', {
        title: 'Old',
        projectId: '9',
      } as TaskRequestDto);

      expect(tasks.save).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '9', ownerId: '777' }),
      );
    });

    it('clears a stale assignee when moving to a project where they are not a member (assigneeId not touched by the request)', async () => {
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
        assigneeId: '2',
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      const targetProject = { id: '9', ownerId: '777' };
      access.requireAccess
        .mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' })
        .mockResolvedValueOnce({ project: targetProject, role: 'EDITOR' });
      access.isMember.mockResolvedValueOnce(false); // '2' is not a member of the target project '9'
      tasks.save.mockImplementation((task) => Promise.resolve(task));

      const result = await service.update(ownerId, actorEmail, '30', {
        title: 'Old',
        projectId: '9',
      } as TaskRequestDto);

      expect(access.isMember).toHaveBeenCalledWith('9', '2');
      expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: '9', assigneeId: null }));
      expect(result.assigneeId).toBeNull();
    });

    it('keeps a still-valid assignee when moving to a project where they remain a member', async () => {
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
        assigneeId: '2',
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      const targetProject = { id: '9', ownerId: '777' };
      access.requireAccess
        .mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' })
        .mockResolvedValueOnce({ project: targetProject, role: 'EDITOR' });
      access.isMember.mockResolvedValueOnce(true); // '2' is still a member of the target project '9'
      tasks.save.mockImplementation((task) => Promise.resolve(task));

      await service.update(ownerId, actorEmail, '30', {
        title: 'Old',
        projectId: '9',
      } as TaskRequestDto);

      expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: '9', assigneeId: '2' }));
    });

    it('rejects assigning a non-member of the project, without saving', async () => {
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
        assigneeId: null,
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' });
      access.isMember.mockResolvedValueOnce(false);

      await expect(
        service.update(ownerId, actorEmail, '30', {
          title: 'Old',
          assigneeId: '999',
        } as TaskRequestDto),
      ).rejects.toMatchObject({ status: 400 });

      expect(access.isMember).toHaveBeenCalledWith('5', '999');
      expect(tasks.save).not.toHaveBeenCalled();
    });

    it('rejects assigning a personal (projectId null) task', async () => {
      const t = {
        id: '31',
        ownerId,
        projectId: null,
        title: 'Personal',
        status: 'TODO',
        assigneeId: null,
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);

      await expect(
        service.update(ownerId, actorEmail, '31', {
          title: 'Personal',
          assigneeId: '2',
        } as TaskRequestDto),
      ).rejects.toMatchObject({ status: 400 });

      expect(tasks.save).not.toHaveBeenCalled();
    });

    it('reassignment cancels the previous assignee notification and enqueues for the new one', async () => {
      const dueAt = new Date(Date.now() + 3_600_000);
      const t = {
        id: '30',
        ownerId,
        projectId: '5',
        title: 'Old',
        status: 'TODO',
        dueAt,
        notifyMinutesBefore: 15,
        assigneeId: '2',
      } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockResolvedValueOnce({ project: { id: '5', ownerId }, role: 'EDITOR' });
      access.isMember.mockResolvedValueOnce(true);
      tasks.save.mockImplementation((task) => Promise.resolve(task));

      await service.update(ownerId, actorEmail, '30', {
        title: 'Old',
        assigneeId: '3',
      } as TaskRequestDto);

      expect(access.isMember).toHaveBeenCalledWith('5', '3');
      expect(notifications.cancelForSource).toHaveBeenCalledWith('2', 'task', '30');
      expect(notifications.cancelForSource).toHaveBeenCalledWith('3', 'task', '30');
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: '3', kind: 'task', sourceId: '30' }),
      );
    });
  });

  describe('delete', () => {
    it("cancels notifications using the task's owner id, not the acting collaborator's id", async () => {
      const t = { id: '30', ownerId: '777', projectId: '5' } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockResolvedValueOnce({
        project: { id: '5', ownerId: '777' },
        role: 'EDITOR',
      });

      await service.delete(ownerId, '30'); // ownerId ('1') is a collaborator, not the task owner ('777')

      expect(notifications.cancelForSource).toHaveBeenCalledWith('777', 'task', '30');
      expect(tasks.softRemove).toHaveBeenCalledWith(t);
    });

    it('cancels notifications for both the owner and the assignee when they differ', async () => {
      const t = { id: '30', ownerId: '777', projectId: '5', assigneeId: '888' } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(t);
      access.requireAccess.mockResolvedValueOnce({
        project: { id: '5', ownerId: '777' },
        role: 'EDITOR',
      });

      await service.delete(ownerId, '30');

      expect(notifications.cancelForSource).toHaveBeenCalledWith('777', 'task', '30');
      expect(notifications.cancelForSource).toHaveBeenCalledWith('888', 'task', '30');
      expect(notifications.cancelForSource).toHaveBeenCalledTimes(2);
      expect(tasks.softRemove).toHaveBeenCalledWith(t);
    });
  });

  describe('restore', () => {
    const id = '30';
    const deletedRow = {
      id,
      ownerId,
      projectId: null,
      title: 'Write the report',
      description: null,
      status: 'TODO',
      priority: 'MEDIUM',
      dueAt: null,
      position: 0,
      notifyMinutesBefore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as Task;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as Task;

    it('restores a soft-deleted personal task, re-syncs its notification and returns the live DTO', async () => {
      tasks.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, id);

      expect(tasks.findOne).toHaveBeenNthCalledWith(1, { where: { id }, withDeleted: true });
      expect(access.requireAccess).not.toHaveBeenCalled();
      expect(tasks.restore).toHaveBeenCalledWith({ id });
      expect(notifications.cancelForSource).toHaveBeenCalledWith(ownerId, 'task', id);
      expect(result.id).toBe(id);
    });

    it('throws 404 when the task does not exist at all', async () => {
      tasks.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(tasks.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the task exists but is not soft-deleted', async () => {
      tasks.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, id)).rejects.toThrow(ApiException);
      expect(tasks.restore).not.toHaveBeenCalled();
    });

    it("404s instead of restoring another owner's personal task", async () => {
      const otherOwnerId = '999';
      tasks.findOne.mockResolvedValueOnce(deletedRow); // deletedRow.ownerId === ownerId, not otherOwnerId

      await expect(service.restore(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(tasks.restore).not.toHaveBeenCalled();
      expect(access.requireAccess).not.toHaveBeenCalled();
    });

    it('throws not-found when restoring a task whose project is itself soft-deleted', async () => {
      const projectTask = { ...deletedRow, projectId: '5' } as unknown as Task;
      tasks.findOne.mockResolvedValueOnce(projectTask);
      access.requireAccess.mockRejectedValueOnce(ApiException.notFound('Project not found'));

      await expect(service.restore(ownerId, id)).rejects.toMatchObject({ status: 404 });
      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'EDITOR');
      expect(tasks.restore).not.toHaveBeenCalled();
    });
  });

  describe('reorderForProject', () => {
    it('requires EDITOR access and updates position filtering by project_id, not owner_id', async () => {
      const project = { id: '5', ownerId: '2' };
      access.requireAccess.mockResolvedValueOnce({ project, role: 'EDITOR' });

      await service.reorderForProject(ownerId, '5', [{ id: '30', position: 2 }]);

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '5', 'EDITOR');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(qb.update).toHaveBeenCalledWith(Task);
      expect(qb.set).toHaveBeenCalledWith({ position: 2 });
      expect(qb.where).toHaveBeenCalledWith('id = :id AND project_id = :projectId', {
        id: '30',
        projectId: project.id,
      });
      const whereClause = qb.where.mock.calls[0][0] as string;
      expect(whereClause).not.toMatch(/owner_id|ownerId/);
      expect(qb.execute).toHaveBeenCalled();
    });

    it('no-ops without starting a transaction when items is empty', async () => {
      const project = { id: '5', ownerId: '2' };
      access.requireAccess.mockResolvedValueOnce({ project, role: 'EDITOR' });

      await service.reorderForProject(ownerId, '5', []);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
