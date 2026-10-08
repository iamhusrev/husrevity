import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationAccountService } from './integration-account.service';
import { IntegrationAccount } from './integration-account.entity';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';

type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

type MockCrypto = {
  encrypt: jest.Mock;
  decrypt: jest.Mock;
};

describe('IntegrationAccountService', () => {
  const ownerId = '100';
  const provider = 'google_calendar';
  let service: IntegrationAccountService;
  let repo: MockRepo;
  let cryptoService: MockCrypto;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn((v) => Promise.resolve({ id: 'acc-1', ...v })),
    };

    cryptoService = {
      encrypt: jest.fn((val) => (val ? `enc:${val}` : null)),
      decrypt: jest.fn((val) => (val ? val.replace(/^enc:/, '') : null)),
    };

    const module = await Test.createTestingModule({
      providers: [
        IntegrationAccountService,
        { provide: getRepositoryToken(IntegrationAccount), useValue: repo },
        { provide: CryptoService, useValue: cryptoService },
      ],
    }).compile();

    service = module.get(IntegrationAccountService);
  });

  describe('save', () => {
    it('creates a new account when none exists and encrypts tokens', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const result = await service.save(
        ownerId,
        provider,
        { accessToken: 'access-123', refreshToken: 'refresh-456' },
        ['calendar.readonly'],
      );

      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId, provider } });
      expect(cryptoService.encrypt).toHaveBeenCalledWith('access-123');
      expect(cryptoService.encrypt).toHaveBeenCalledWith('refresh-456');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId,
          provider,
          encryptedAccessToken: 'enc:access-123',
          encryptedRefreshToken: 'enc:refresh-456',
          scopes: ['calendar.readonly'],
          status: 'connected',
        }),
      );
      expect(result.id).toBe('acc-1');
    });

    it('updates existing account when one exists', async () => {
      const existing = {
        id: 'acc-1',
        ownerId,
        provider,
        encryptedAccessToken: 'enc:old-access',
        encryptedRefreshToken: 'enc:old-refresh',
        scopes: [],
        status: 'disconnected',
        connectedAt: new Date(0),
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(existing);

      await service.save(ownerId, provider, { accessToken: 'new-access' }, ['calendar.events']);

      expect(existing.encryptedAccessToken).toBe('enc:new-access');
      expect(existing.encryptedRefreshToken).toBe('enc:old-refresh');
      expect(existing.scopes).toEqual(['calendar.events']);
      expect(existing.status).toBe('connected');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });
  });

  describe('get', () => {
    it('returns decrypted tokens and account when connected', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        encryptedAccessToken: 'enc:access-123',
        encryptedRefreshToken: 'enc:refresh-456',
        status: 'connected',
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      const result = await service.get(ownerId, provider);

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('access-123');
      expect(result?.refreshToken).toBe('refresh-456');
      expect(result?.account).toBe(account);
    });

    it('returns null when account does not exist or status is not connected', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      expect(await service.get(ownerId, provider)).toBeNull();

      repo.findOne.mockResolvedValueOnce({
        status: 'disconnected',
      } as unknown as IntegrationAccount);
      expect(await service.get(ownerId, provider)).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('marks account status as disconnected', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        status: 'connected',
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      await service.disconnect(ownerId, provider);

      expect(account.status).toBe('disconnected');
      expect(repo.save).toHaveBeenCalledWith(account);
    });

    it('throws 404 ApiException when account does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(service.disconnect(ownerId, provider)).rejects.toThrow(ApiException);
    });
  });

  describe('updateSyncToken', () => {
    it('updates syncToken and lastSyncAt', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        syncToken: null,
        lastSyncAt: null,
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      const syncDate = new Date();
      await service.updateSyncToken(ownerId, provider, 'token-xyz', syncDate);

      expect(account.syncToken).toBe('token-xyz');
      expect(account.lastSyncAt).toBe(syncDate);
      expect(repo.save).toHaveBeenCalledWith(account);
    });

    it('throws 404 ApiException when account does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(service.updateSyncToken(ownerId, provider, 'token')).rejects.toThrow(
        ApiException,
      );
    });
  });

  describe('updateCalendarId', () => {
    it('updates calendarId', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        calendarId: null,
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      await service.updateCalendarId(ownerId, provider, 'cal-husrevity-123');

      expect(account.calendarId).toBe('cal-husrevity-123');
      expect(repo.save).toHaveBeenCalledWith(account);
    });

    it('throws 404 ApiException when account does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(service.updateCalendarId(ownerId, provider, 'cal-id')).rejects.toThrow(
        ApiException,
      );
    });
  });

  describe('updateWatchChannel', () => {
    it('updates channelId, resourceId, channelExpiration, and channelToken', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        channelId: null,
        resourceId: null,
        channelExpiration: null,
        channelToken: null,
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      const exp = new Date('2026-10-01T00:00:00Z');
      await service.updateWatchChannel(ownerId, provider, 'chan-123', 'res-456', exp, 'tok-789');

      expect(account.channelId).toBe('chan-123');
      expect(account.resourceId).toBe('res-456');
      expect(account.channelExpiration).toBe(exp);
      expect(account.channelToken).toBe('tok-789');
      expect(repo.save).toHaveBeenCalledWith(account);
    });

    it('throws 404 ApiException when account does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateWatchChannel(ownerId, provider, 'chan', 'res', new Date(), 'tok'),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('findByChannelId', () => {
    it('returns matching connected integration account', async () => {
      const account = {
        id: 'acc-1',
        ownerId,
        provider,
        channelId: 'chan-123',
        status: 'connected',
      } as unknown as IntegrationAccount;

      repo.findOne.mockResolvedValueOnce(account);

      const res = await service.findByChannelId('chan-123');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { channelId: 'chan-123', provider: 'google_calendar', status: 'connected' },
      });
      expect(res).toBe(account);
    });
  });

  describe('findAccountsNeedingWatchRenewal', () => {
    it('queries repository for connected accounts with expiring or missing channel expiration', async () => {
      const mockAccounts = [{ id: 'acc-1' }];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockAccounts),
      };

      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

      const res = await service.findAccountsNeedingWatchRenewal('google_calendar', 24);

      expect((repo as any).createQueryBuilder).toHaveBeenCalledWith('account');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('account.provider = :provider', {
        provider: 'google_calendar',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('account.status = :status', {
        status: 'connected',
      });
      expect(res).toBe(mockAccounts);
    });
  });

  describe('findConnectedAccounts', () => {
    it('returns list of connected integration accounts for given provider', async () => {
      const mockAccounts = [{ id: 'acc-1', provider: 'google_calendar', status: 'connected' }];
      repo.find.mockResolvedValueOnce(mockAccounts);

      const res = await service.findConnectedAccounts('google_calendar');

      expect(repo.find).toHaveBeenCalledWith({
        where: { provider: 'google_calendar', status: 'connected' },
      });
      expect(res).toBe(mockAccounts);
    });
  });
});
