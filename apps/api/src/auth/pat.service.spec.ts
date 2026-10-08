import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PatService } from './pat.service';
import { PersonalAccessToken } from './personal-access-token.entity';
import { ApiException } from '../common/api.exception';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  softRemove: jest.Mock;
};

describe('PatService', () => {
  const ownerId = '1';
  let service: PatService;
  let pats: MockRepo;

  beforeEach(async () => {
    pats = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: '10', ...v })),
      find: jest.fn(),
      softRemove: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [PatService, { provide: getRepositoryToken(PersonalAccessToken), useValue: pats }],
    }).compile();
    service = module.get(PatService);
  });

  describe('issue', () => {
    it('returns a raw token and never stores it — only its hash', async () => {
      const result = await service.issue(ownerId, 'MCP token', ['items:read']);

      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken.length).toBeGreaterThan(20);
      const created = pats.create.mock.calls[0][0];
      expect(created.tokenHash).not.toBe(result.rawToken);
      expect(created).not.toHaveProperty('rawToken');
    });
  });

  describe('validate', () => {
    it('returns null for an unknown token', async () => {
      pats.findOne.mockResolvedValueOnce(null);
      expect(await service.validate('nope')).toBeNull();
    });

    it('returns null for an expired token without revealing it existed', async () => {
      pats.findOne.mockResolvedValueOnce({
        ownerId,
        scopes: ['items:read'],
        expiresAt: new Date(Date.now() - 1000),
      } as PersonalAccessToken);
      expect(await service.validate('expired')).toBeNull();
      expect(pats.save).not.toHaveBeenCalled();
    });

    it('bumps lastUsedAt and returns {ownerId, scopes} for a valid token', async () => {
      const pat = {
        ownerId,
        scopes: ['items:read', 'notes:write'],
        expiresAt: null,
        lastUsedAt: null,
      } as PersonalAccessToken;
      pats.findOne.mockResolvedValueOnce(pat);

      const result = await service.validate('valid');

      expect(result).toEqual({ ownerId, scopes: ['items:read', 'notes:write'] });
      expect(pat.lastUsedAt).toBeInstanceOf(Date);
      expect(pats.save).toHaveBeenCalledWith(pat);
    });

    it('never expires when expiresAt is null', async () => {
      pats.findOne.mockResolvedValueOnce({
        ownerId,
        scopes: [] as PersonalAccessToken['scopes'],
        expiresAt: null,
      } as unknown as PersonalAccessToken);
      expect(await service.validate('forever')).not.toBeNull();
    });
  });

  describe('revoke', () => {
    it('404s when the token does not belong to the caller (or does not exist)', async () => {
      pats.findOne.mockResolvedValueOnce(null);
      await expect(service.revoke(ownerId, '10')).rejects.toThrow(ApiException);
      expect(pats.softRemove).not.toHaveBeenCalled();
    });

    it('soft-removes an owned token', async () => {
      const pat = { id: '10', ownerId } as PersonalAccessToken;
      pats.findOne.mockResolvedValueOnce(pat);
      await service.revoke(ownerId, '10');
      expect(pats.softRemove).toHaveBeenCalledWith(pat);
    });
  });
});
