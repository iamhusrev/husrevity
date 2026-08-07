import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectMemberService } from './project-member.service';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { ProjectAccessService } from './project-access.service';
import { ProjectInviteService } from './project-invite.service';
import { UserService } from '../user/user.service';
import { MailerService } from '../notification/mailer.service';
import { User } from '../user/user.entity';
import { ApiException } from '../common/api.exception';
import { AddProjectMemberDto, UpdateProjectMemberRoleDto } from './dto/project-member-dtos';

type MockMemberRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
};

type MockAccessService = { requireAccess: jest.Mock };
type MockUserService = { findByEmail: jest.Mock; requireById: jest.Mock };
type MockInviteService = { createInvite: jest.Mock; buildProjectUrl: jest.Mock };
type MockMailerService = { isConfigured: jest.Mock; sendProjectMemberAddedEmail: jest.Mock };

describe('ProjectMemberService', () => {
  const actingUserId = '1';
  const actingUserEmail = 'owner@example.com';
  const projectId = '10';

  let service: ProjectMemberService;
  let members: MockMemberRepo;
  let access: MockAccessService;
  let users: MockUserService;
  let invites: MockInviteService;
  let mailer: MockMailerService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    members = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };
    access = { requireAccess: jest.fn() };
    users = { findByEmail: jest.fn(), requireById: jest.fn() };
    invites = { createInvite: jest.fn(), buildProjectUrl: jest.fn() };
    mailer = { isConfigured: jest.fn().mockReturnValue(false), sendProjectMemberAddedEmail: jest.fn() };
    dataSource = { query: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: getRepositoryToken(ProjectMember), useValue: members },
        { provide: ProjectAccessService, useValue: access },
        { provide: UserService, useValue: users },
        { provide: ProjectInviteService, useValue: invites },
        { provide: MailerService, useValue: mailer },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ProjectMemberService);
  });

  describe('list', () => {
    it('requires VIEWER access, sorts OWNER first then by joinedAt, and maps each member via users.requireById', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'VIEWER' });
      const editorRow = {
        id: 'm2',
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date('2024-01-02'),
      } as unknown as ProjectMember;
      const ownerRow = {
        id: 'm1',
        userId: 'u1',
        role: 'OWNER',
        joinedAt: new Date('2024-01-03'),
      } as unknown as ProjectMember;
      const viewerRow = {
        id: 'm3',
        userId: 'u3',
        role: 'VIEWER',
        joinedAt: new Date('2024-01-01'),
      } as unknown as ProjectMember;
      members.find.mockResolvedValueOnce([editorRow, ownerRow, viewerRow]);
      users.requireById.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          email: `${id}@example.com`,
          firstName: null,
          lastName: null,
        } as unknown as User),
      );

      const result = await service.list(actingUserId, projectId);

      expect(access.requireAccess).toHaveBeenCalledWith(actingUserId, projectId, 'VIEWER');
      expect(members.find).toHaveBeenCalledWith({ where: { projectId } });
      // OWNER first, then remaining rows sorted by joinedAt ascending.
      expect(result.map((r) => r.id)).toEqual(['m1', 'm3', 'm2']);
      expect(users.requireById).toHaveBeenCalledWith('u1');
      expect(users.requireById).toHaveBeenCalledWith('u2');
      expect(users.requireById).toHaveBeenCalledWith('u3');
    });
  });

  describe('add', () => {
    const dto: AddProjectMemberDto = { email: 'New@Example.com', role: 'EDITOR' };
    const project = { id: projectId, name: 'Acme project' } as unknown as Project;

    beforeEach(() => {
      access.requireAccess.mockResolvedValue({ project, role: 'OWNER' });
    });

    it('requires OWNER access and inserts a fresh member row when the email belongs to a user with no prior membership', async () => {
      const existingUser = {
        id: 'u2',
        email: 'new@example.com',
        emailNotificationsEnabled: false,
      } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      members.findOne.mockResolvedValueOnce(null);
      const created = { projectId, userId: 'u2', role: 'EDITOR' };
      members.create.mockReturnValueOnce(created);
      members.save.mockResolvedValueOnce({
        id: 'm9',
        projectId,
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date(),
      });

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(access.requireAccess).toHaveBeenCalledWith(actingUserId, projectId, 'OWNER');
      expect(users.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(members.findOne).toHaveBeenCalledWith({
        where: { projectId, userId: 'u2' },
        withDeleted: true,
      });
      expect(members.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, userId: 'u2', role: 'EDITOR', invitedById: actingUserId }),
      );
      expect(members.save).toHaveBeenCalledWith(created);
      expect(result.member).not.toBeNull();
      expect(result.invite).toBeNull();
      expect(result.inviteUrl).toBeNull();
      expect(mailer.sendProjectMemberAddedEmail).not.toHaveBeenCalled();
    });

    it('throws conflict when the existing user already has a LIVE membership row', async () => {
      const existingUser = { id: 'u2', email: 'new@example.com' } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      members.findOne.mockResolvedValueOnce({
        id: 'm1',
        projectId,
        userId: 'u2',
        deletedAt: null,
      } as unknown as ProjectMember);

      await expect(service.add(actingUserId, actingUserEmail, projectId, dto)).rejects.toMatchObject({
        status: 409,
      });
      expect(members.create).not.toHaveBeenCalled();
      expect(members.save).not.toHaveBeenCalled();
    });

    it('restores a SOFT-DELETED prior membership row instead of inserting a new row or throwing conflict', async () => {
      const existingUser = {
        id: 'u2',
        email: 'new@example.com',
        emailNotificationsEnabled: false,
      } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      const softDeleted = {
        id: 'm1',
        projectId,
        userId: 'u2',
        role: 'VIEWER',
        deletedAt: new Date('2024-01-01'),
        joinedAt: new Date('2023-01-01'),
      } as unknown as ProjectMember;
      members.findOne.mockResolvedValueOnce(softDeleted);
      members.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(members.create).not.toHaveBeenCalled();
      expect(members.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', deletedAt: null, role: 'EDITOR', invitedById: actingUserId }),
      );
      expect(result.member?.role).toBe('EDITOR');
    });

    it('sends the added-member email when the mailer is configured and the invitee opted in', async () => {
      const existingUser = {
        id: 'u2',
        email: 'new@example.com',
        emailNotificationsEnabled: true,
      } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      members.findOne.mockResolvedValueOnce(null);
      members.create.mockReturnValueOnce({});
      members.save.mockResolvedValueOnce({
        id: 'm9',
        projectId,
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date(),
      });
      mailer.isConfigured.mockReturnValueOnce(true);
      invites.buildProjectUrl.mockReturnValueOnce('http://localhost:3090/projects/10');
      mailer.sendProjectMemberAddedEmail.mockResolvedValueOnce(true);

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(mailer.sendProjectMemberAddedEmail).toHaveBeenCalledWith(
        'new@example.com',
        project.name,
        actingUserEmail,
        'http://localhost:3090/projects/10',
        'EDITOR',
      );
      expect(result.emailDelivered).toBe(true);
    });

    it('does NOT send the email when the mailer is configured but the invitee has not opted in', async () => {
      const existingUser = {
        id: 'u2',
        email: 'new@example.com',
        emailNotificationsEnabled: false,
      } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      members.findOne.mockResolvedValueOnce(null);
      members.create.mockReturnValueOnce({});
      members.save.mockResolvedValueOnce({
        id: 'm9',
        projectId,
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date(),
      });
      mailer.isConfigured.mockReturnValueOnce(true);

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(mailer.sendProjectMemberAddedEmail).not.toHaveBeenCalled();
      expect(result.emailDelivered).toBe(false);
    });

    it('does NOT send the email when the invitee opted in but the mailer is not configured', async () => {
      const existingUser = {
        id: 'u2',
        email: 'new@example.com',
        emailNotificationsEnabled: true,
      } as unknown as User;
      users.findByEmail.mockResolvedValueOnce(existingUser);
      members.findOne.mockResolvedValueOnce(null);
      members.create.mockReturnValueOnce({});
      members.save.mockResolvedValueOnce({
        id: 'm9',
        projectId,
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date(),
      });
      mailer.isConfigured.mockReturnValueOnce(false);

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(mailer.sendProjectMemberAddedEmail).not.toHaveBeenCalled();
      expect(result.emailDelivered).toBe(false);
    });

    it('delegates to ProjectInviteService.createInvite when no user exists for the invited email', async () => {
      users.findByEmail.mockResolvedValueOnce(null);
      const invite = {
        id: 'i1',
        email: 'new@example.com',
        role: 'EDITOR',
        expiresAt: new Date(),
        createdAt: new Date(),
      };
      invites.createInvite.mockResolvedValueOnce({
        invite,
        inviteUrl: 'http://localhost:3090/project-invite/tok',
        emailDelivered: true,
      });

      const result = await service.add(actingUserId, actingUserEmail, projectId, dto);

      expect(invites.createInvite).toHaveBeenCalledWith(
        projectId,
        actingUserId,
        actingUserEmail,
        'new@example.com',
        'EDITOR',
      );
      expect(result.member).toBeNull();
      expect(result.invite).not.toBeNull();
      expect(result.inviteUrl).toBe('http://localhost:3090/project-invite/tok');
      expect(result.emailDelivered).toBe(true);
      expect(members.save).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    const memberId = 'm1';
    const dto: UpdateProjectMemberRoleDto = { role: 'VIEWER' };

    it('requires OWNER access before touching the member row', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      members.findOne.mockResolvedValueOnce({
        id: memberId,
        projectId,
        userId: 'u2',
        role: 'EDITOR',
        joinedAt: new Date(),
      });
      members.save.mockImplementation((m) => Promise.resolve(m));
      users.requireById.mockResolvedValueOnce({
        id: 'u2',
        email: 'x@example.com',
        firstName: null,
        lastName: null,
      } as unknown as User);

      await service.updateRole(actingUserId, projectId, memberId, dto);

      expect(access.requireAccess).toHaveBeenCalledWith(actingUserId, projectId, 'OWNER');
    });

    it("throws bad-request when trying to change the OWNER's role, without saving", async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      members.findOne.mockResolvedValueOnce({ id: memberId, projectId, userId: 'u1', role: 'OWNER' });

      await expect(service.updateRole(actingUserId, projectId, memberId, dto)).rejects.toMatchObject({
        status: 400,
      });
      expect(members.save).not.toHaveBeenCalled();
    });

    it('applies the new role for an EDITOR/VIEWER target member', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      const member = { id: memberId, projectId, userId: 'u2', role: 'VIEWER', joinedAt: new Date() };
      members.findOne.mockResolvedValueOnce(member);
      members.save.mockImplementation((m) => Promise.resolve(m));
      users.requireById.mockResolvedValueOnce({
        id: 'u2',
        email: 'x@example.com',
        firstName: 'X',
        lastName: 'Y',
      } as unknown as User);

      const result = await service.updateRole(actingUserId, projectId, memberId, { role: 'EDITOR' });

      expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'EDITOR' }));
      expect(result.role).toBe('EDITOR');
    });

    it('throws not-found when no member row matches (id, projectId)', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      members.findOne.mockResolvedValueOnce(null);

      await expect(service.updateRole(actingUserId, projectId, memberId, dto)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('remove', () => {
    const memberId = 'm1';

    it('requires OWNER access before touching the member row', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      const member = { id: memberId, projectId, userId: 'u2', role: 'EDITOR' };
      members.findOne.mockResolvedValueOnce(member);

      await service.remove(actingUserId, projectId, memberId);

      expect(access.requireAccess).toHaveBeenCalledWith(actingUserId, projectId, 'OWNER');
    });

    it('throws bad-request when targeting the OWNER role member, and never calls softRemove', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      members.findOne.mockResolvedValueOnce({ id: memberId, projectId, userId: 'u1', role: 'OWNER' });

      await expect(service.remove(actingUserId, projectId, memberId)).rejects.toMatchObject({
        status: 400,
      });
      expect(members.softRemove).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('soft-removes an EDITOR/VIEWER member and clears them as a dangling task assignee in the project', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      const member = { id: memberId, projectId, userId: 'u2', role: 'EDITOR' };
      members.findOne.mockResolvedValueOnce(member);

      await service.remove(actingUserId, projectId, memberId);

      expect(members.softRemove).toHaveBeenCalledWith(member);
      expect(dataSource.query).toHaveBeenCalledWith(
        'UPDATE task SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2',
        [projectId, 'u2'],
      );
    });

    it('throws not-found when no member row matches (id, projectId)', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });
      members.findOne.mockResolvedValueOnce(null);

      await expect(service.remove(actingUserId, projectId, memberId)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('leave', () => {
    it('requires VIEWER-level (any live membership) access', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'EDITOR' });
      members.findOne.mockResolvedValueOnce({
        id: 'm2',
        projectId,
        userId: actingUserId,
        role: 'EDITOR',
      });

      await service.leave(actingUserId, projectId);

      expect(access.requireAccess).toHaveBeenCalledWith(actingUserId, projectId, 'VIEWER');
    });

    it('throws bad-request when the caller is the OWNER, and never calls softRemove', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'OWNER' });

      await expect(service.leave(actingUserId, projectId)).rejects.toMatchObject({ status: 400 });
      expect(members.softRemove).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('soft-removes the caller and clears them as assignee, for an EDITOR/VIEWER self', async () => {
      access.requireAccess.mockResolvedValueOnce({ project: {}, role: 'VIEWER' });
      const member = { id: 'm2', projectId, userId: actingUserId, role: 'VIEWER' };
      members.findOne.mockResolvedValueOnce(member);

      await service.leave(actingUserId, projectId);

      expect(members.softRemove).toHaveBeenCalledWith(member);
      expect(dataSource.query).toHaveBeenCalledWith(
        'UPDATE task SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2',
        [projectId, actingUserId],
      );
    });
  });
});
