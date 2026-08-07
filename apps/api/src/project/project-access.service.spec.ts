import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectAccessService } from './project-access.service';
import { Project } from './project.entity';
import { ProjectMember, ProjectRole } from './project-member.entity';

type MockProjectRepo = { findOne: jest.Mock };
type MockMemberRepo = { findOne: jest.Mock };

describe('ProjectAccessService', () => {
  const userId = '1';
  const projectId = '10';

  let service: ProjectAccessService;
  let projects: MockProjectRepo;
  let members: MockMemberRepo;

  beforeEach(async () => {
    projects = { findOne: jest.fn() };
    members = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProjectAccessService,
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(ProjectMember), useValue: members },
      ],
    }).compile();

    service = module.get(ProjectAccessService);
  });

  describe('requireAccess', () => {
    it.each<ProjectRole>(['OWNER', 'EDITOR', 'VIEWER'])(
      'returns { project, role } for a %s member with the default minRole',
      async (role) => {
        const project = { id: projectId } as unknown as Project;
        projects.findOne.mockResolvedValueOnce(project);
        members.findOne.mockResolvedValueOnce({ role } as unknown as ProjectMember);

        const result = await service.requireAccess(userId, projectId);

        expect(result).toEqual({ project, role });
      },
    );

    it('throws 404 (not 403) when no project_member row exists for the project+user', async () => {
      projects.findOne.mockResolvedValueOnce({ id: projectId } as unknown as Project);
      members.findOne.mockResolvedValueOnce(null);

      await expect(service.requireAccess(userId, projectId, 'OWNER')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 404 when the project itself does not exist', async () => {
      projects.findOne.mockResolvedValueOnce(null);

      await expect(service.requireAccess(userId, projectId)).rejects.toMatchObject({ status: 404 });
      expect(members.findOne).not.toHaveBeenCalled();
    });

    it('throws 403 when a VIEWER member calls with minRole EDITOR', async () => {
      projects.findOne.mockResolvedValueOnce({ id: projectId } as unknown as Project);
      members.findOne.mockResolvedValueOnce({ role: 'VIEWER' } as unknown as ProjectMember);

      await expect(service.requireAccess(userId, projectId, 'EDITOR')).rejects.toMatchObject({
        status: 403,
      });
    });

    it('throws 403 when an EDITOR member calls with minRole OWNER', async () => {
      projects.findOne.mockResolvedValueOnce({ id: projectId } as unknown as Project);
      members.findOne.mockResolvedValueOnce({ role: 'EDITOR' } as unknown as ProjectMember);

      await expect(service.requireAccess(userId, projectId, 'OWNER')).rejects.toMatchObject({
        status: 403,
      });
    });

    it.each<ProjectRole>(['OWNER', 'EDITOR', 'VIEWER'])(
      'defaults minRole to VIEWER, so a %s member passes a call with no minRole argument',
      async (role) => {
        projects.findOne.mockResolvedValueOnce({ id: projectId } as unknown as Project);
        members.findOne.mockResolvedValueOnce({ role } as unknown as ProjectMember);

        await expect(service.requireAccess(userId, projectId)).resolves.toMatchObject({ role });
      },
    );
  });

  describe('atLeast', () => {
    it('ranks VIEWER < EDITOR < OWNER', () => {
      expect(ProjectAccessService.atLeast('VIEWER', 'EDITOR')).toBe(false);
      expect(ProjectAccessService.atLeast('VIEWER', 'OWNER')).toBe(false);
      expect(ProjectAccessService.atLeast('EDITOR', 'OWNER')).toBe(false);
      expect(ProjectAccessService.atLeast('OWNER', 'VIEWER')).toBe(true);
      expect(ProjectAccessService.atLeast('OWNER', 'EDITOR')).toBe(true);
      expect(ProjectAccessService.atLeast('EDITOR', 'VIEWER')).toBe(true);
    });

    it('treats equal roles as satisfying the minimum', () => {
      expect(ProjectAccessService.atLeast('EDITOR', 'EDITOR')).toBe(true);
      expect(ProjectAccessService.atLeast('OWNER', 'OWNER')).toBe(true);
      expect(ProjectAccessService.atLeast('VIEWER', 'VIEWER')).toBe(true);
    });
  });

  describe('findAccess', () => {
    it('returns null (not a rejection) when the project does not exist', async () => {
      projects.findOne.mockResolvedValueOnce(null);

      await expect(service.findAccess(userId, projectId)).resolves.toBeNull();
      expect(members.findOne).not.toHaveBeenCalled();
    });

    it('returns null (not a rejection) when there is no membership row', async () => {
      projects.findOne.mockResolvedValueOnce({ id: projectId } as unknown as Project);
      members.findOne.mockResolvedValueOnce(null);

      await expect(service.findAccess(userId, projectId)).resolves.toBeNull();
    });

    it('returns { project, role } when a membership exists, without a minRole check (no such parameter)', async () => {
      const project = { id: projectId } as unknown as Project;
      projects.findOne.mockResolvedValueOnce(project);
      members.findOne.mockResolvedValueOnce({ role: 'VIEWER' } as unknown as ProjectMember);

      // findAccess only takes (userId, projectId) — there is no minRole argument to pass.
      const result = await service.findAccess(userId, projectId);

      expect(result).toEqual({ project, role: 'VIEWER' });
    });
  });

  describe('isMember', () => {
    it('returns true when a project_member row exists, regardless of role', async () => {
      members.findOne.mockResolvedValueOnce({ role: 'VIEWER' } as unknown as ProjectMember);

      await expect(service.isMember(projectId, userId)).resolves.toBe(true);
    });

    it('returns false when no project_member row exists', async () => {
      members.findOne.mockResolvedValueOnce(null);

      await expect(service.isMember(projectId, userId)).resolves.toBe(false);
    });
  });
});
