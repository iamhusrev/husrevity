import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ApiException } from '../common/api.exception';
import { ProjectRequestDto } from './dto/project-dtos';

type MockRepo = {
  findOne: jest.Mock;
  restore: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

describe('ProjectService', () => {
  const ownerId = '1';

  let service: ProjectService;
  let projects: MockRepo;

  beforeEach(async () => {
    projects = { findOne: jest.fn(), restore: jest.fn(), create: jest.fn(), save: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ProjectService, { provide: getRepositoryToken(Project), useValue: projects }],
    }).compile();

    service = module.get(ProjectService);
  });

  describe('restore', () => {
    const code = 'ACME';
    const deletedRow = {
      id: '10',
      ownerId,
      code,
      name: 'Acme project',
      description: null,
      status: 'ACTIVE',
      startDate: null,
      endDate: null,
      pinned: false,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as unknown as Project;
    const liveRow = { ...deletedRow, deletedAt: null } as unknown as Project;

    it('restores a soft-deleted project and returns the live DTO', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow).mockResolvedValueOnce(liveRow);

      const result = await service.restore(ownerId, code);

      expect(projects.findOne).toHaveBeenNthCalledWith(1, {
        where: { ownerId, code },
        withDeleted: true,
      });
      expect(projects.restore).toHaveBeenCalledWith({ id: deletedRow.id, ownerId });
      expect(result.code).toBe(code);
    });

    it('throws 404 when the project does not exist at all', async () => {
      projects.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, code)).rejects.toThrow(ApiException);
      expect(projects.restore).not.toHaveBeenCalled();
    });

    it('throws 404 when the project exists but is not soft-deleted', async () => {
      projects.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, code)).rejects.toThrow(ApiException);
      expect(projects.restore).not.toHaveBeenCalled();
    });

    it('404s instead of restoring another owner\'s project (owner mismatch not found by the query)', async () => {
      const otherOwnerId = '999';
      projects.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(otherOwnerId, code)).rejects.toThrow(ApiException);
      expect(projects.findOne).toHaveBeenCalledWith({
        where: { ownerId: otherOwnerId, code },
        withDeleted: true,
      });
      expect(projects.restore).not.toHaveBeenCalled();
    });

    it('converts a unique-violation on restore (23505) into ApiException.conflict', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow);
      projects.restore.mockRejectedValueOnce({ code: '23505' });

      await expect(service.restore(ownerId, code)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('rethrows non-unique-violation errors from restore untouched', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow);
      const dbError = new Error('connection reset');
      projects.restore.mockRejectedValueOnce(dbError);

      await expect(service.restore(ownerId, code)).rejects.toBe(dbError);
    });
  });

  describe('create', () => {
    const req: ProjectRequestDto = { code: 'ACME', name: 'Acme project' };

    it('creates a new project when the code is unused', async () => {
      projects.findOne.mockResolvedValueOnce(null);
      const saved = { id: '1', ownerId, ...req } as unknown as Project;
      projects.create.mockReturnValue(saved);
      projects.save.mockResolvedValue(saved);

      const result = await service.create(ownerId, req);

      expect(projects.findOne).toHaveBeenCalledWith({
        where: { ownerId, code: req.code },
        withDeleted: true,
      });
      expect(result.code).toBe('ACME');
    });

    it('throws conflict (not a raw save) when the code belongs to a live project', async () => {
      projects.findOne.mockResolvedValueOnce({
        id: '1',
        ownerId,
        code: req.code,
        deletedAt: null,
      } as unknown as Project);

      await expect(service.create(ownerId, req)).rejects.toMatchObject({ status: 409 });
      expect(projects.save).not.toHaveBeenCalled();
    });

    it('throws conflict (not a raw save) when the code belongs to a soft-deleted project', async () => {
      projects.findOne.mockResolvedValueOnce({
        id: '1',
        ownerId,
        code: req.code,
        deletedAt: new Date(),
      } as unknown as Project);

      await expect(service.create(ownerId, req)).rejects.toMatchObject({ status: 409 });
      expect(projects.save).not.toHaveBeenCalled();
    });
  });
});
