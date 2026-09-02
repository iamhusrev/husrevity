import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { ApiException } from '../common/api.exception';
import { ProjectRequestDto } from './dto/project-dtos';

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

  beforeEach(async () => {
    projects = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      restore: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
      find: jest.fn(),
    };
    members = { create: jest.fn(), save: jest.fn(), count: jest.fn() };
    access = { requireAccess: jest.fn(), findAccess: jest.fn(), isMember: jest.fn() };

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

      expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [ownerId, 'all']);
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
        expect.objectContaining({ id: '1', role: 'OWNER', memberCount: 1, ownerName: null, shared: false }),
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

      expect(projects.findOne).toHaveBeenCalledWith({ where: { id: projectId }, withDeleted: true });
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
});
