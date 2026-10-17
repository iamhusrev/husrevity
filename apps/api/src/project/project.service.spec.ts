import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { ApiException } from '../common/api.exception';
import { ProjectRequestDto } from './dto/project-dtos';
import { GoalService } from '../goal/goal.service';

type MockProjectRepo = {
  findOne: jest.Mock;
  findOneOrFail: jest.Mock;
  restore: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
  find: jest.Mock;
};

type MockMemberRepo = {
  create: jest.Mock;
  save: jest.Mock;
  count: jest.Mock;
};

type MockAccessService = {
  requireAccess: jest.Mock;
  findAccess: jest.Mock;
  isMember: jest.Mock;
};

describe('ProjectService', () => {
  const ownerId = '1';

  let service: ProjectService;
  let projects: MockProjectRepo;
  let members: MockMemberRepo;
  let access: MockAccessService;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let em: { getRepository: jest.Mock };
  let goalService: { validateLiveGoal: jest.Mock };

  beforeEach(async () => {
    projects = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      restore: jest.fn(),
      create: jest.fn((v) => ({ id: '1', ...v })),
      save: jest.fn((v) => Promise.resolve({ id: '1', ...v })),
      softRemove: jest.fn(),
      find: jest.fn(),
    };
    members = { create: jest.fn(), save: jest.fn(), count: jest.fn() };
    access = { requireAccess: jest.fn(), findAccess: jest.fn(), isMember: jest.fn() };
    goalService = { validateLiveGoal: jest.fn().mockResolvedValue({ id: '5', ownerId: '1' }) };

    // Mimics DataSource#transaction: runs the callback synchronously with an
    // EntityManager stand-in whose getRepository() returns the same mocks the
    // top-level repos use, so assertions work regardless of whether the code
    // saves via `this.projects` or `em.getRepository(Project)`.
    em = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Project) return projects;
        if (entity === ProjectMember) return members;
        throw new Error(`unexpected entity in transaction: ${String(entity)}`);
      }),
    };
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => cb(em)),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(ProjectMember), useValue: members },
        { provide: ProjectAccessService, useValue: access },
        { provide: DataSource, useValue: dataSource },
        { provide: GoalService, useValue: goalService },
      ],
    }).compile();

    service = module.get(ProjectService);
  });

  describe('list', () => {
    it('maps raw rows into ProjectResponseDto with role/memberCount/ownerName/shared', async () => {
      const rows = [
        {
          id: '10',
          code: 'ACME',
          name: 'Acme project',
          description: null,
          status: 'ACTIVE',
          start_date: null,
          end_date: null,
          pinned: false,
          archived: false,
          created_at: new Date('2024-01-01'),
          created_by_id: null,
          updated_at: new Date('2024-01-02'),
          updated_by_id: null,
          deleted_at: null,
          owner_id: '2',
          my_role: 'EDITOR',
          member_count: '3',
          owner_first_name: 'Ada',
          owner_last_name: 'Lovelace',
        },
        {
          id: '11',
          code: 'SOLO',
          name: 'Solo project',
          description: null,
          status: 'ACTIVE',
          start_date: null,
          end_date: null,
          pinned: true,
          archived: false,
          created_at: new Date('2024-02-01'),
          created_by_id: null,
          updated_at: new Date('2024-02-02'),
          updated_by_id: null,
          deleted_at: null,
          owner_id: ownerId,
          my_role: 'OWNER',
          member_count: 1,
          owner_first_name: null,
          owner_last_name: null,
        },
      ];
      dataSource.query.mockResolvedValueOnce(rows);

      const result = await service.list(ownerId, 'all');

      // 'all' is normalized to NULL: the SQL has no 'all' branch, so passing it through returned no rows.
      expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [ownerId, null]);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '10',
        code: 'ACME',
        role: 'EDITOR',
        memberCount: 3,
        ownerName: 'Ada Lovelace',
        shared: true,
      });
      expect(result[1]).toMatchObject({
        id: '11',
        code: 'SOLO',
        role: 'OWNER',
        memberCount: 1,
        ownerName: null,
        shared: false,
      });
    });

    it("treats the 'all' filter exactly like no filter (the SQL has no 'all' branch)", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.list(ownerId, 'all');
      await service.list(ownerId);

      const [allCall, noFilterCall] = dataSource.query.mock.calls;
      expect(allCall[1]).toEqual([ownerId, null]);
      expect(allCall).toEqual(noFilterCall);
    });

    it('passes a null filter through to the query when none is provided', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await service.list(ownerId);

      expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [ownerId, null]);
    });
  });

  describe('listOwned', () => {
    it("lists the user's own projects via the repo (not raw SQL), defaulting role to OWNER", async () => {
      const rows = [
        {
          id: '1',
          ownerId,
          code: 'A',
          name: 'A',
          description: null,
          status: 'ACTIVE',
          startDate: null,
          endDate: null,
          pinned: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Project,
      ];
      projects.find.mockResolvedValueOnce(rows);

      const result = await service.listOwned(ownerId);

      expect(projects.find).toHaveBeenCalledWith({
        where: { ownerId },
        order: { updatedAt: 'DESC' },
      });
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          id: '1',
          role: 'OWNER',
          memberCount: 1,
          ownerName: null,
          shared: false,
        }),
      ]);
    });
  });

  describe('getById', () => {
    it('delegates authorization to ProjectAccessService and maps the DTO', async () => {
      const project = { id: '10', ownerId: '2' } as unknown as Project;
      access.requireAccess.mockResolvedValueOnce({ project, role: 'VIEWER' });
      members.count.mockResolvedValueOnce(2);
      dataSource.query.mockResolvedValueOnce([{ first_name: 'Ada', last_name: 'Lovelace' }]);

      const result = await service.getById(ownerId, '10');

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, '10');
      expect(result.role).toBe('VIEWER');
      expect(result.memberCount).toBe(2);
      expect(result.ownerName).toBe('Ada Lovelace');
      expect(result.shared).toBe(true);
    });
  });

  describe('create', () => {
    const req: ProjectRequestDto = { code: 'ACME', name: 'Acme project' };

    it('inserts the project AND an OWNER project_member row inside a transaction', async () => {
      projects.findOne.mockResolvedValueOnce(null);
      const savedProject = { id: '1', ownerId, ...req } as unknown as Project;
      projects.create.mockReturnValue(savedProject);
      projects.save.mockResolvedValue(savedProject);
      const savedMember = { id: 'm1', projectId: '1', userId: ownerId, role: 'OWNER' };
      members.create.mockReturnValue(savedMember);
      members.save.mockResolvedValue(savedMember);

      const result = await service.create(ownerId, req);

      expect(projects.findOne).toHaveBeenCalledWith({
        where: { ownerId, code: req.code },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(em.getRepository).toHaveBeenCalledWith(Project);
      expect(em.getRepository).toHaveBeenCalledWith(ProjectMember);
      expect(projects.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId, code: req.code, name: req.name }),
      );
      expect(projects.save).toHaveBeenCalledWith(savedProject);
      expect(members.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: savedProject.id, userId: ownerId, role: 'OWNER' }),
      );
      expect(members.save).toHaveBeenCalledWith(savedMember);
      expect(result.code).toBe('ACME');
      expect(result.role).toBe('OWNER');
    });

    it('throws conflict (not a raw save) when the code belongs to a live project', async () => {
      projects.findOne.mockResolvedValueOnce({
        id: '1',
        ownerId,
        code: req.code,
        deletedAt: null,
      } as unknown as Project);

      await expect(service.create(ownerId, req)).rejects.toMatchObject({ status: 409 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(projects.save).not.toHaveBeenCalled();
      expect(members.save).not.toHaveBeenCalled();
    });

    it('allows creation when the code only belongs to a soft-deleted project', async () => {
      // `uq_project_owner_code_live` (migration 1715000018000) scopes
      // uniqueness to live rows only, so TypeORM's default (soft-delete
      // excluding) findOne never resolves a deleted row here in real usage
      // — reflected by mocking it to resolve `null`, same as the live-row
      // creation test above.
      projects.findOne.mockResolvedValueOnce(null);
      const savedProject = { id: '2', ownerId, ...req } as unknown as Project;
      projects.create.mockReturnValue(savedProject);
      projects.save.mockResolvedValue(savedProject);
      const savedMember = { id: 'm2', projectId: '2', userId: ownerId, role: 'OWNER' };
      members.create.mockReturnValue(savedMember);
      members.save.mockResolvedValue(savedMember);

      const result = await service.create(ownerId, req);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.code).toBe('ACME');
    });
  });

  describe('update', () => {
    const projectId = '10';
    const baseProject = () =>
      ({
        id: projectId,
        ownerId,
        code: 'ACME',
        name: 'Acme project',
        description: null,
        status: 'ACTIVE',
        startDate: null,
        endDate: null,
        pinned: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }) as unknown as Project;

    it('throws forbidden when an EDITOR tries to archive the project', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: baseProject(), role: 'EDITOR' });

      await expect(service.update(ownerId, projectId, { archived: true })).rejects.toMatchObject({
        status: 403,
      });
      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, projectId, 'EDITOR');
      expect(projects.save).not.toHaveBeenCalled();
    });

    it('allows an OWNER to archive the project', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: baseProject(), role: 'OWNER' });
      projects.save.mockImplementation((p) => Promise.resolve(p));
      members.count.mockResolvedValueOnce(1);
      dataSource.query.mockResolvedValueOnce([]);

      const result = await service.update(ownerId, projectId, { archived: true });

      expect(projects.save).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
      expect(result.archived).toBe(true);
      expect(result.role).toBe('OWNER');
    });

    it('allows an EDITOR to rename the project (no archive flag involved)', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: baseProject(), role: 'EDITOR' });
      projects.save.mockImplementation((p) => Promise.resolve(p));
      members.count.mockResolvedValueOnce(2);
      dataSource.query.mockResolvedValueOnce([{ first_name: 'Ada', last_name: 'Lovelace' }]);

      const result = await service.update(ownerId, projectId, { name: 'Renamed' });

      expect(projects.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
      expect(result.name).toBe('Renamed');
      expect(result.role).toBe('EDITOR');
      expect(result.shared).toBe(true);
    });
  });

  describe('If-Match', () => {
    const projectId = '10';
    const UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');
    const row = () => ({ id: projectId, ownerId, updatedAt: UPDATED_AT }) as unknown as Project;

    it('update throws 409 and saves nothing when ifMatchMs is stale', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: row(), role: 'OWNER' });

      await expect(
        service.update(ownerId, projectId, { name: 'X' }, UPDATED_AT.getTime() - 1),
      ).rejects.toMatchObject({ status: 409 });
      expect(projects.save).not.toHaveBeenCalled();
    });

    it('update applies when ifMatchMs equals updatedAt', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: row(), role: 'OWNER' });
      projects.save.mockImplementation((p) => Promise.resolve(p));
      members.count.mockResolvedValueOnce(1);
      dataSource.query.mockResolvedValueOnce([]);

      await service.update(ownerId, projectId, { name: 'X' }, UPDATED_AT.getTime());

      expect(projects.save).toHaveBeenCalled();
    });

    it('delete throws 409 and removes nothing when ifMatchMs is stale', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: row(), role: 'OWNER' });

      await expect(
        service.delete(ownerId, projectId, UPDATED_AT.getTime() - 1),
      ).rejects.toMatchObject({ status: 409 });
      expect(projects.softRemove).not.toHaveBeenCalled();
    });

    it('delete proceeds when ifMatchMs equals updatedAt', async () => {
      const project = row();
      access.requireAccess.mockResolvedValueOnce({ project, role: 'OWNER' });

      await service.delete(ownerId, projectId, UPDATED_AT.getTime());

      expect(projects.softRemove).toHaveBeenCalledWith(project);
    });
  });

  describe('delete', () => {
    const projectId = '10';

    it('requires OWNER role and soft-removes the project', async () => {
      const project = { id: projectId } as unknown as Project;
      access.requireAccess.mockResolvedValueOnce({ project, role: 'OWNER' });

      await service.delete(ownerId, projectId);

      expect(access.requireAccess).toHaveBeenCalledWith(ownerId, projectId, 'OWNER');
      expect(projects.softRemove).toHaveBeenCalledWith(project);
    });

    it('does not catch/swallow a forbidden rejection from ProjectAccessService', async () => {
      access.requireAccess.mockRejectedValueOnce(ApiException.forbidden('nope'));

      await expect(service.delete(ownerId, projectId)).rejects.toMatchObject({ status: 403 });
      expect(projects.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    const projectId = '10';
    const deletedRow = {
      id: projectId,
      ownerId,
      code: 'ACME',
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

    it('restores a soft-deleted project and returns the live DTO, bypassing ProjectAccessService entirely', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow);
      projects.findOneOrFail.mockResolvedValueOnce(liveRow);
      members.count.mockResolvedValueOnce(1);
      dataSource.query.mockResolvedValueOnce([]);

      const result = await service.restore(ownerId, projectId);

      expect(projects.findOne).toHaveBeenCalledWith({
        where: { id: projectId },
        withDeleted: true,
      });
      expect(projects.restore).toHaveBeenCalledWith({ id: deletedRow.id, ownerId });
      expect(result.code).toBe('ACME');
      // Deliberate design point: restore is owner-only and must never consult
      // ProjectAccessService (a collaborator must not resurrect a project the
      // owner deleted).
      expect(access.requireAccess).not.toHaveBeenCalled();
      expect(access.isMember).not.toHaveBeenCalled();
      expect(access.findAccess).not.toHaveBeenCalled();
    });

    it('throws 404 when the project does not exist at all', async () => {
      projects.findOne.mockResolvedValueOnce(null);

      await expect(service.restore(ownerId, projectId)).rejects.toThrow(ApiException);
      expect(projects.restore).not.toHaveBeenCalled();
      expect(access.requireAccess).not.toHaveBeenCalled();
    });

    it('throws 404 when the project exists but is not soft-deleted', async () => {
      projects.findOne.mockResolvedValueOnce({ ...deletedRow, deletedAt: null });

      await expect(service.restore(ownerId, projectId)).rejects.toThrow(ApiException);
      expect(projects.restore).not.toHaveBeenCalled();
    });

    it("404s instead of restoring another owner's project even though a member could see it", async () => {
      const otherOwnerId = '999';
      projects.findOne.mockResolvedValueOnce(deletedRow); // exists, but owned by `ownerId`, not `otherOwnerId`

      await expect(service.restore(otherOwnerId, projectId)).rejects.toThrow(ApiException);
      expect(projects.restore).not.toHaveBeenCalled();
      expect(access.requireAccess).not.toHaveBeenCalled();
    });

    it('converts a unique-violation on restore (23505) into ApiException.conflict', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow);
      projects.restore.mockRejectedValueOnce({ code: '23505' });

      await expect(service.restore(ownerId, projectId)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('rethrows non-unique-violation errors from restore untouched', async () => {
      projects.findOne.mockResolvedValueOnce(deletedRow);
      const dbError = new Error('connection reset');
      projects.restore.mockRejectedValueOnce(dbError);

      await expect(service.restore(ownerId, projectId)).rejects.toBe(dbError);
    });
  });

  describe('goalId on projects', () => {
    it('sets goalId on create when valid', async () => {
      projects.findOne.mockResolvedValueOnce(null);
      const res = await service.create(ownerId, {
        code: 'NEWP',
        name: 'New Project',
        goalId: '5',
      });
      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(res.goalId).toBe('5');
    });

    it('rejects foreign or nonexistent goalId on create with 404', async () => {
      projects.findOne.mockResolvedValueOnce(null);
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

      await expect(
        service.create(ownerId, {
          code: 'NEWP',
          name: 'New Project',
          goalId: '999',
        }),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('sets goalId on update when valid', async () => {
      const existing = {
        id: '1',
        ownerId,
        code: 'P1',
        name: 'Project 1',
        goalId: null,
      } as Project;
      access.requireAccess.mockResolvedValueOnce({ project: existing, role: 'OWNER' });
      projects.save.mockImplementationOnce((p: any) => Promise.resolve(p));

      const res = await service.update(ownerId, '1', { goalId: '5' });
      expect(goalService.validateLiveGoal).toHaveBeenCalledWith(ownerId, '5', undefined);
      expect(res.goalId).toBe('5');
    });

    it('clears goalId on update when null is passed', async () => {
      const existing = {
        id: '1',
        ownerId,
        code: 'P1',
        name: 'Project 1',
        goalId: '5',
      } as Project;
      access.requireAccess.mockResolvedValueOnce({ project: existing, role: 'OWNER' });
      projects.save.mockImplementationOnce((p: any) => Promise.resolve(p));

      const res = await service.update(ownerId, '1', { goalId: null });
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(res.goalId).toBeNull();
    });

    it('absence of goalId on update leaves existing value untouched', async () => {
      const existing = {
        id: '1',
        ownerId,
        code: 'P1',
        name: 'Project 1',
        goalId: '5',
      } as Project;
      access.requireAccess.mockResolvedValueOnce({ project: existing, role: 'OWNER' });
      projects.save.mockImplementationOnce((p: any) => Promise.resolve(p));

      const res = await service.update(ownerId, '1', { name: 'Renamed' });
      expect(goalService.validateLiveGoal).not.toHaveBeenCalled();
      expect(res.goalId).toBe('5');
    });

    it('rejects foreign or deleted goalId on update with 404', async () => {
      const existing = {
        id: '1',
        ownerId,
        code: 'P1',
        name: 'Project 1',
        goalId: null,
      } as Project;
      access.requireAccess.mockResolvedValueOnce({ project: existing, role: 'OWNER' });
      goalService.validateLiveGoal.mockRejectedValueOnce(ApiException.notFound('Goal not found'));

      await expect(service.update(ownerId, '1', { goalId: '999' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws forbidden 403 when an EDITOR tries to change the project goal', async () => {
      const existing = {
        id: '1',
        ownerId: '999',
        code: 'P1',
        name: 'Project 1',
        goalId: null,
      } as Project;
      access.requireAccess.mockResolvedValueOnce({ project: existing, role: 'EDITOR' });

      await expect(service.update(ownerId, '1', { goalId: '5' })).rejects.toMatchObject({
        status: 403,
      });
      expect(projects.save).not.toHaveBeenCalled();
    });

    it('rejects empty string goalId on project DTOs with validation error', async () => {
      const { validate } = require('class-validator');
      const { plainToInstance } = require('class-transformer');
      const { ProjectRequestDto, ProjectUpdateRequestDto } = require('./dto/project-dtos');

      const invalidCreate = plainToInstance(ProjectRequestDto, {
        code: 'P1',
        name: 'Project 1',
        goalId: '',
      });
      const createErrors = await validate(invalidCreate);
      expect(createErrors.some((e: any) => e.property === 'goalId')).toBe(true);

      const invalidUpdate = plainToInstance(ProjectUpdateRequestDto, {
        goalId: '',
      });
      const updateErrors = await validate(invalidUpdate);
      expect(updateErrors.some((e: any) => e.property === 'goalId')).toBe(true);

      for (const goalId of [null, '123', undefined]) {
        const validCreate = plainToInstance(ProjectRequestDto, {
          code: 'P1',
          name: 'Project 1',
          goalId,
        });
        const vCreateErrors = await validate(validCreate);
        expect(vCreateErrors.some((e: any) => e.property === 'goalId')).toBe(false);

        const validUpdate = plainToInstance(ProjectUpdateRequestDto, { goalId });
        const vUpdateErrors = await validate(validUpdate);
        expect(vUpdateErrors.some((e: any) => e.property === 'goalId')).toBe(false);
      }
    });
  });
});
