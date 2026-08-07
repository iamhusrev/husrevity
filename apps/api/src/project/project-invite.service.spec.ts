import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { ProjectInviteService } from './project-invite.service';
import { ProjectInvite } from './project-invite.entity';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { User } from '../user/user.entity';
import { MailerService } from '../notification/mailer.service';
import { RegisterViaProjectInviteDto } from './dto/project-invite-dtos';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

type MockInviteRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
};
type MockMemberRepo = { findOne: jest.Mock };
type MockProjectRepo = { findOne: jest.Mock };
type MockUserRepo = { findOne: jest.Mock };
type MockMailerService = { isConfigured: jest.Mock; sendProjectInviteEmail: jest.Mock };
type MockConfigService = { get: jest.Mock };

// Stand-in for the transactional EntityManager. getRepository(ProjectMember)
// routes to `emMemberRepo`; `save`/`create` are used directly for User and
// ProjectInvite entities, mirroring how the real service calls them.
type MockEntityManager = { getRepository: jest.Mock; save: jest.Mock; create: jest.Mock };

describe('ProjectInviteService', () => {
  let service: ProjectInviteService;
  let invites: MockInviteRepo;
  let members: MockMemberRepo;
  let projects: MockProjectRepo;
  let users: MockUserRepo;
  let mailer: MockMailerService;
  let config: MockConfigService;
  let emMemberRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let em: MockEntityManager;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    invites = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };
    members = { findOne: jest.fn() };
    projects = { findOne: jest.fn() };
    users = { findOne: jest.fn() };
    mailer = { isConfigured: jest.fn().mockReturnValue(false), sendProjectInviteEmail: jest.fn() };
    config = { get: jest.fn().mockReturnValue(undefined) };

    emMemberRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    em = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ProjectMember) return emMemberRepo;
        throw new Error(`unexpected entity in transaction: ${String(entity)}`);
      }),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      create: jest.fn((_entity: unknown, data: unknown) => data),
    };
    dataSource = { transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => cb(em)) };

    const module = await Test.createTestingModule({
      providers: [
        ProjectInviteService,
        { provide: getRepositoryToken(ProjectInvite), useValue: invites },
        { provide: getRepositoryToken(ProjectMember), useValue: members },
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: DataSource, useValue: dataSource },
        { provide: MailerService, useValue: mailer },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(ProjectInviteService);
  });

  describe('createInvite', () => {
    const projectId = '10';
    const project = { id: projectId, name: 'Acme project' } as unknown as Project;

    beforeEach(() => {
      projects.findOne.mockResolvedValue(project);
    });

    it('throws not-found when the project does not exist', async () => {
      projects.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createInvite(projectId, '1', 'owner@example.com', 'new@example.com', 'EDITOR'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('stores only a SHA-256 hash of the token — never the plaintext', async () => {
      invites.find.mockResolvedValueOnce([]);
      invites.create.mockImplementation((data) => data);
      let saved: { tokenHash: string } | undefined;
      invites.save.mockImplementation((data) => {
        saved = { id: 'i1', ...data };
        return Promise.resolve(saved);
      });

      const { inviteUrl } = await service.createInvite(
        projectId,
        '1',
        'owner@example.com',
        'new@example.com',
        'EDITOR',
      );

      const plaintextToken = inviteUrl.split('/').pop()!;
      expect(saved!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(saved!.tokenHash).not.toBe(plaintextToken);
      expect(sha256(plaintextToken)).toBe(saved!.tokenHash);
    });

    it('soft-removes a stale unaccepted invite for the same project+email before creating the new one', async () => {
      const stale = [{ id: 'old1' }];
      invites.find.mockResolvedValueOnce(stale);
      invites.create.mockImplementation((data) => data);
      invites.save.mockImplementation((data) => Promise.resolve({ id: 'i2', ...data }));

      await service.createInvite(projectId, '1', 'owner@example.com', 'new@example.com', 'EDITOR');

      expect(invites.find).toHaveBeenCalledWith({
        where: expect.objectContaining({ projectId, email: 'new@example.com' }),
      });
      expect(invites.softRemove).toHaveBeenCalledWith(stale);
    });

    it('does NOT call softRemove when there is no stale invite for the project+email', async () => {
      invites.find.mockResolvedValueOnce([]);
      invites.create.mockImplementation((data) => data);
      invites.save.mockImplementation((data) => Promise.resolve({ id: 'i3', ...data }));

      await service.createInvite(projectId, '1', 'owner@example.com', 'new@example.com', 'EDITOR');

      expect(invites.softRemove).not.toHaveBeenCalled();
    });

    it('sends the invite email and reports emailDelivered when the mailer is configured', async () => {
      invites.find.mockResolvedValueOnce([]);
      invites.create.mockImplementation((data) => data);
      invites.save.mockImplementation((data) => Promise.resolve({ id: 'i4', ...data }));
      mailer.isConfigured.mockReturnValueOnce(true);
      mailer.sendProjectInviteEmail.mockResolvedValueOnce(true);

      const result = await service.createInvite(
        projectId,
        '1',
        'owner@example.com',
        'new@example.com',
        'EDITOR',
      );

      expect(mailer.sendProjectInviteEmail).toHaveBeenCalledWith(
        'new@example.com',
        project.name,
        'owner@example.com',
        result.inviteUrl,
        'EDITOR',
        expect.any(Date),
      );
      expect(result.emailDelivered).toBe(true);
    });

    it('skips sending the email (and reports emailDelivered=false) when the mailer is not configured', async () => {
      invites.find.mockResolvedValueOnce([]);
      invites.create.mockImplementation((data) => data);
      invites.save.mockImplementation((data) => Promise.resolve({ id: 'i5', ...data }));
      mailer.isConfigured.mockReturnValueOnce(false);

      const result = await service.createInvite(
        projectId,
        '1',
        'owner@example.com',
        'new@example.com',
        'EDITOR',
      );

      expect(mailer.sendProjectInviteEmail).not.toHaveBeenCalled();
      expect(result.emailDelivered).toBe(false);
    });
  });

  describe('lookup (also exercises the private requireLiveInvite guard)', () => {
    const token = 'plaintext-lookup-token';
    const tokenHash = sha256(token);
    function makeInvite(overrides: Partial<ProjectInvite> = {}): ProjectInvite {
      return {
        id: 'i1',
        projectId: '10',
        email: 'invited@example.com',
        role: 'EDITOR',
        tokenHash,
        invitedById: '2',
        acceptedAt: null,
        acceptedUserId: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      } as unknown as ProjectInvite;
    }

    it('throws not-found when no invite matches the token hash', async () => {
      invites.findOne.mockResolvedValueOnce(null);

      await expect(service.lookup(token)).rejects.toMatchObject({ status: 404 });
    });

    it('throws bad-request when the invite was already accepted', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite({ acceptedAt: new Date() }));

      await expect(service.lookup(token)).rejects.toMatchObject({ status: 400 });
    });

    it('throws bad-request when the invite has expired', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite({ expiresAt: new Date(Date.now() - 1000) }));

      await expect(service.lookup(token)).rejects.toMatchObject({ status: 400 });
    });

    it('returns requiresRegistration=true when no User exists for the invite email', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite());
      projects.findOne.mockResolvedValueOnce({ id: '10', name: 'Acme project', code: 'ACME' });
      users.findOne
        .mockResolvedValueOnce({ id: '2', email: 'inviter@example.com' }) // inviter lookup
        .mockResolvedValueOnce(null); // existing-account-for-invite-email lookup

      const result = await service.lookup(token);

      expect(result.requiresRegistration).toBe(true);
      expect(result.invitedByEmail).toBe('inviter@example.com');
    });

    it('returns requiresRegistration=false when a User already exists for the invite email', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite());
      projects.findOne.mockResolvedValueOnce({ id: '10', name: 'Acme project', code: 'ACME' });
      users.findOne
        .mockResolvedValueOnce({ id: '2', email: 'inviter@example.com' })
        .mockResolvedValueOnce({ id: '3', email: 'invited@example.com' });

      const result = await service.lookup(token);

      expect(result.requiresRegistration).toBe(false);
    });
  });

  describe('acceptForExistingUser', () => {
    const token = 'plaintext-accept-token';
    const tokenHash = sha256(token);
    function makeInvite(overrides: Partial<ProjectInvite> = {}): ProjectInvite {
      return {
        id: 'i1',
        projectId: '10',
        email: 'invited@example.com',
        role: 'EDITOR',
        tokenHash,
        invitedById: '2',
        acceptedAt: null,
        acceptedUserId: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      } as unknown as ProjectInvite;
    }

    it('throws forbidden when the caller email does not match the invite email', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite());

      await expect(
        service.acceptForExistingUser(token, '5', 'someone-else@example.com'),
      ).rejects.toMatchObject({ status: 403 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('is a no-op success when the caller is already a live member — does not start a transaction or mutate the invite', async () => {
      const invite = makeInvite();
      invites.findOne.mockResolvedValueOnce(invite);
      members.findOne.mockResolvedValueOnce({
        id: 'm5',
        projectId: '10',
        userId: '5',
        role: 'VIEWER',
      });

      const result = await service.acceptForExistingUser(token, '5', 'invited@example.com');

      expect(result).toEqual({ projectId: '10', role: 'VIEWER' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invite.acceptedAt).toBeNull();
    });

    it('on a genuine accept: inserts the member row, marks the invite accepted, inside a transaction, matching case-insensitively', async () => {
      const invite = makeInvite();
      invites.findOne.mockResolvedValueOnce(invite);
      members.findOne.mockResolvedValueOnce(null); // not already a member
      emMemberRepo.findOne.mockResolvedValueOnce(null); // upsertMemberRow: no existing row at all

      const result = await service.acceptForExistingUser(token, '5', 'INVITED@EXAMPLE.COM');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(emMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '10', userId: '5', role: 'EDITOR', invitedById: '2' }),
      );
      expect(emMemberRepo.save).toHaveBeenCalled();
      expect(invite.acceptedAt).not.toBeNull();
      expect(invite.acceptedUserId).toBe('5');
      expect(em.save).toHaveBeenCalledWith(invite);
      expect(result).toEqual({ projectId: '10', role: 'EDITOR' });
    });
  });

  describe('registerAndCreateMember', () => {
    const token = 'plaintext-register-token';
    const tokenHash = sha256(token);
    function makeInvite(overrides: Partial<ProjectInvite> = {}): ProjectInvite {
      return {
        id: 'i1',
        projectId: '10',
        email: 'newperson@example.com',
        role: 'VIEWER',
        tokenHash,
        invitedById: '2',
        acceptedAt: null,
        acceptedUserId: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      } as unknown as ProjectInvite;
    }
    const dto: RegisterViaProjectInviteDto = {
      password: 'supersecret1',
      firstName: 'New',
      lastName: 'Person',
    };

    it('throws conflict when a User with the invite email already exists, without starting a transaction', async () => {
      invites.findOne.mockResolvedValueOnce(makeInvite());
      users.findOne.mockResolvedValueOnce({ id: '9', email: 'newperson@example.com' });

      await expect(service.registerAndCreateMember(token, dto)).rejects.toMatchObject({ status: 409 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('creates a new bcrypt-hashed User, inserts a member row for the invite role, marks the invite accepted, and returns the User (not an auth/token DTO)', async () => {
      const invite = makeInvite();
      invites.findOne.mockResolvedValueOnce(invite);
      users.findOne.mockResolvedValueOnce(null); // no email collision
      em.create.mockImplementation((_entity: unknown, data: Record<string, unknown>) => ({
        id: 'u99',
        ...data,
      }));
      emMemberRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.registerAndCreateMember(token, dto);

      expect(em.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ email: 'newperson@example.com', firstName: 'New', lastName: 'Person' }),
      );
      const createdUserArg = em.create.mock.calls[0][1] as { passwordHash: string };
      expect(createdUserArg.passwordHash).toBeDefined();
      expect(createdUserArg.passwordHash).not.toBe(dto.password);

      expect(emMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '10', userId: 'u99', role: 'VIEWER', invitedById: '2' }),
      );
      expect(invite.acceptedAt).not.toBeNull();
      expect(invite.acceptedUserId).toBe('u99');

      // Returns the plain User entity — this service has no AuthService/JwtService
      // dependency at all (see constructor providers above), so it can never mint
      // a token itself; the AuthModule caller does that separately.
      expect(result).toEqual(expect.objectContaining({ id: 'u99', email: 'newperson@example.com' }));
      expect((result as unknown as { passwordHash: string }).passwordHash).not.toBe(dto.password);
    });
  });

  describe('activatePendingForUser', () => {
    const email = 'user@example.com';
    const userId = '5';
    function makeInvite(id: string, projectId: string): ProjectInvite {
      return {
        id,
        projectId,
        email,
        role: 'EDITOR',
        tokenHash: `hash-${id}`,
        invitedById: '2',
        acceptedAt: null,
        acceptedUserId: null,
        expiresAt: new Date(Date.now() + 60_000),
      } as unknown as ProjectInvite;
    }

    it('activates every live invite for the email across multiple projects', async () => {
      const inviteA = makeInvite('iA', '10');
      const inviteB = makeInvite('iB', '11');
      invites.find.mockResolvedValueOnce([inviteA, inviteB]);
      emMemberRepo.findOne.mockResolvedValue(null);

      await service.activatePendingForUser(userId, email);

      expect(invites.find).toHaveBeenCalledWith({
        where: expect.objectContaining({ email }),
      });
      expect(emMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '10', userId, role: 'EDITOR' }),
      );
      expect(emMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '11', userId, role: 'EDITOR' }),
      );
      expect(inviteA.acceptedAt).not.toBeNull();
      expect(inviteB.acceptedAt).not.toBeNull();
    });

    it('keeps processing subsequent invites when an earlier one fails internally, and never rejects itself', async () => {
      const inviteA = makeInvite('iA', '10');
      const inviteB = makeInvite('iB', '11');
      invites.find.mockResolvedValueOnce([inviteA, inviteB]);
      dataSource.transaction
        .mockImplementationOnce(() => Promise.reject(new Error('boom')))
        .mockImplementationOnce((cb: (em: unknown) => Promise<unknown>) => cb(em));
      emMemberRepo.findOne.mockResolvedValue(null);

      await expect(service.activatePendingForUser(userId, email)).resolves.toBeUndefined();

      expect(emMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: '11', userId, role: 'EDITOR' }),
      );
      expect(inviteB.acceptedAt).not.toBeNull();
      // inviteA's transaction rejected before any mutation happened on it.
      expect(inviteA.acceptedAt).toBeNull();
    });
  });

  describe('revoke', () => {
    it('throws not-found when no invite matches (projectId, inviteId)', async () => {
      invites.findOne.mockResolvedValueOnce(null);

      await expect(service.revoke('10', 'i1')).rejects.toMatchObject({ status: 404 });
    });

    it('throws bad-request when the invite is already accepted', async () => {
      invites.findOne.mockResolvedValueOnce({ id: 'i1', acceptedAt: new Date() });

      await expect(service.revoke('10', 'i1')).rejects.toMatchObject({ status: 400 });
      expect(invites.softRemove).not.toHaveBeenCalled();
    });

    it('soft-removes a live, unaccepted invite', async () => {
      const invite = { id: 'i1', acceptedAt: null };
      invites.findOne.mockResolvedValueOnce(invite);

      await service.revoke('10', 'i1');

      expect(invites.softRemove).toHaveBeenCalledWith(invite);
    });
  });

  describe('cleanupExpiredInvites', () => {
    it('soft-removes every unaccepted invite past its expiresAt', async () => {
      const expired = [{ id: 'i1' }, { id: 'i2' }];
      invites.find.mockResolvedValueOnce(expired);

      await service.cleanupExpiredInvites();

      expect(invites.softRemove).toHaveBeenCalledWith(expired);
    });

    it('no-ops (never calls softRemove) when there are no expired invites', async () => {
      invites.find.mockResolvedValueOnce([]);

      await service.cleanupExpiredInvites();

      expect(invites.softRemove).not.toHaveBeenCalled();
    });
  });
});
