import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { User } from '../user/user.entity';
import { ApiException } from '../common/api.exception';
import { ProjectInviteService } from '../project/project-invite.service';

type MockRefreshTokenRepo = { findOne: jest.Mock; createQueryBuilder: jest.Mock };
type MockUserRepo = { findOne: jest.Mock };
type MockQueryBuilder = { update: jest.Mock; set: jest.Mock; where: jest.Mock; execute: jest.Mock };

function makeQueryBuilder(): MockQueryBuilder {
  const qb: Partial<MockQueryBuilder> = {};
  qb.update = jest.fn().mockReturnValue(qb);
  qb.set = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return qb as MockQueryBuilder;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokens: MockRefreshTokenRepo;
  let users: MockUserRepo;
  let qb: MockQueryBuilder;
  let em: { save: jest.Mock; create: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    qb = makeQueryBuilder();
    refreshTokens = { findOne: jest.fn(), createQueryBuilder: jest.fn(() => qb) };
    users = { findOne: jest.fn() };
    em = {
      save: jest.fn((v) => Promise.resolve(v)),
      create: jest.fn((_entity, v) => v),
    };
    dataSource = { transaction: jest.fn((cb) => cb(em)) };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('access-token') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: DataSource, useValue: dataSource },
        { provide: ProjectInviteService, useValue: { activatePendingForUser: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('refresh — reuse detection', () => {
    it('throws 401 for an unknown token without touching any family', async () => {
      refreshTokens.findOne.mockResolvedValueOnce(null);

      await expect(service.refresh({ refreshToken: 'nope' })).rejects.toThrow(ApiException);
      expect(refreshTokens.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('revokes the ENTIRE family and throws the same generic 401 when a revoked (already-rotated) token is presented again', async () => {
      const raw = 'stolen-refresh-token';
      const token = {
        id: '10',
        tokenHash: sha256(raw),
        userId: '1',
        familyId: 'fam-1',
        revoked: true,
        expiresAt: new Date(Date.now() + 60_000),
      } as RefreshToken;
      refreshTokens.findOne.mockResolvedValueOnce(token);

      await expect(service.refresh({ refreshToken: raw })).rejects.toThrow(
        'Invalid or expired refresh token',
      );

      expect(qb.update).toHaveBeenCalledWith(RefreshToken);
      expect(qb.set).toHaveBeenCalledWith({ revoked: true });
      expect(qb.where).toHaveBeenCalledWith(
        'family_id = :familyId AND revoked = false',
        { familyId: 'fam-1' },
      );
      // The whole point: no new tokens get issued for a reuse attempt.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws 401 for a plain expired (never-revoked) token without touching the family', async () => {
      const raw = 'expired-token';
      const token = {
        id: '10',
        tokenHash: sha256(raw),
        userId: '1',
        familyId: 'fam-1',
        revoked: false,
        expiresAt: new Date(Date.now() - 1000),
      } as RefreshToken;
      refreshTokens.findOne.mockResolvedValueOnce(token);

      await expect(service.refresh({ refreshToken: raw })).rejects.toThrow(ApiException);
      expect(refreshTokens.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rotates normally: revokes the presented token and issues a new one carrying the SAME familyId', async () => {
      const raw = 'valid-refresh-token';
      const token = {
        id: '10',
        tokenHash: sha256(raw),
        userId: '1',
        familyId: 'fam-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 60_000),
      } as RefreshToken;
      refreshTokens.findOne.mockResolvedValueOnce(token);
      users.findOne.mockResolvedValueOnce({ id: '1', enabled: true, email: 'a@b.com', role: 'user' } as User);

      await service.refresh({ refreshToken: raw });

      expect(token.revoked).toBe(true);
      expect(em.save).toHaveBeenCalledWith(token);
      expect(em.create).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ userId: '1', familyId: 'fam-1', revoked: false }),
      );
    });
  });

  describe('login — starts a fresh family', () => {
    it('issues a refresh token with a newly generated familyId (not shared with anything)', async () => {
      users.findOne.mockResolvedValueOnce({
        id: '1',
        enabled: true,
        email: 'a@b.com',
        role: 'user',
        passwordHash: await bcryptHashFor('secret'),
      } as User);

      await service.login({ email: 'a@b.com', password: 'secret' });

      const created = em.create.mock.calls[0][1];
      expect(typeof created.familyId).toBe('string');
      expect(created.familyId.length).toBeGreaterThan(0);
    });
  });
});

async function bcryptHashFor(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 4);
}
