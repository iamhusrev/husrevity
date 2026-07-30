import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TaskService } from './task.service';
import { Task } from './task.entity';
import { ApiException } from '../common/api.exception';
import { ProjectService } from '../project/project.service';
import { NotificationService } from '../notification/notification.service';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
};

describe('TaskService', () => {
  const ownerId = '1';

  let service: TaskService;
  let tasks: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };

  beforeEach(async () => {
    tasks = { findOne: jest.fn(), restore: jest.fn() };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: getRepositoryToken(Task), useValue: tasks },
        { provide: ProjectService, useValue: { requireByCode: jest.fn() } },
        { provide: DataSource, useValue: {} },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TaskService);
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

    it('restores a soft-deleted task, re-syncs its notification and returns the live DTO', async () => {
      tasks.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, id);

      expect(tasks.findOne).toHaveBeenNthCalledWith(1, {
        where: { id, ownerId },
        withDeleted: true,
      });
      expect(tasks.restore).toHaveBeenCalledWith({ id, ownerId });
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

    it('404s instead of restoring another owner\'s task (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      tasks.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(otherOwnerId, id)).rejects.toThrow(ApiException);
      expect(tasks.findOne).toHaveBeenCalledWith({
        where: { id, ownerId: otherOwnerId },
        withDeleted: true,
      });
      expect(tasks.restore).not.toHaveBeenCalled();
    });
  });
});
