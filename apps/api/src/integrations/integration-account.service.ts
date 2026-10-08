import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoService } from '../crypto/crypto.service';
import { IntegrationAccount, IntegrationProvider } from './integration-account.entity';
import { ApiException } from '../common/api.exception';

export interface DecryptedIntegrationAccount {
  account: IntegrationAccount;
  accessToken: string;
  refreshToken: string | null;
}

export interface SaveTokensPayload {
  accessToken: string;
  refreshToken?: string | null;
}

@Injectable()
export class IntegrationAccountService {
  constructor(
    @InjectRepository(IntegrationAccount)
    private readonly repo: Repository<IntegrationAccount>,
    private readonly cryptoService: CryptoService,
  ) {}

  async save(
    ownerId: string,
    provider: IntegrationProvider,
    tokens: SaveTokensPayload,
    scopes: string[],
  ): Promise<IntegrationAccount> {
    let account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    const encryptedAccess = this.cryptoService.encrypt(tokens.accessToken);
    if (!encryptedAccess) {
      throw ApiException.badRequest('Failed to encrypt access token');
    }

    const encryptedRefresh =
      tokens.refreshToken !== undefined
        ? this.cryptoService.encrypt(tokens.refreshToken)
        : (account?.encryptedRefreshToken ?? null);

    if (!account) {
      account = this.repo.create({
        ownerId,
        provider,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        scopes,
        status: 'connected',
        connectedAt: new Date(),
      });
    } else {
      account.encryptedAccessToken = encryptedAccess;
      account.encryptedRefreshToken = encryptedRefresh;
      account.scopes = scopes;
      account.status = 'connected';
      account.connectedAt = new Date();
    }

    return this.repo.save(account);
  }

  async get(
    ownerId: string,
    provider: IntegrationProvider,
  ): Promise<DecryptedIntegrationAccount | null> {
    const account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    if (!account || account.status !== 'connected') {
      return null;
    }

    const accessToken = this.cryptoService.decrypt(account.encryptedAccessToken);
    if (!accessToken) {
      return null;
    }

    const refreshToken = this.cryptoService.decrypt(account.encryptedRefreshToken);

    return {
      account,
      accessToken,
      refreshToken,
    };
  }

  async disconnect(ownerId: string, provider: IntegrationProvider): Promise<void> {
    const account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    if (!account) {
      throw ApiException.notFound('Integration account not found');
    }

    account.status = 'disconnected';
    await this.repo.save(account);
  }

  async updateSyncToken(
    ownerId: string,
    provider: IntegrationProvider,
    syncToken: string | null,
    lastSyncAt: Date = new Date(),
  ): Promise<void> {
    const account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    if (!account) {
      throw ApiException.notFound('Integration account not found');
    }

    account.syncToken = syncToken;
    account.lastSyncAt = lastSyncAt;
    await this.repo.save(account);
  }

  async updateCalendarId(
    ownerId: string,
    provider: IntegrationProvider,
    calendarId: string | null,
  ): Promise<void> {
    const account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    if (!account) {
      throw ApiException.notFound('Integration account not found');
    }

    account.calendarId = calendarId;
    await this.repo.save(account);
  }

  async updateWatchChannel(
    ownerId: string,
    provider: IntegrationProvider,
    channelId: string | null,
    resourceId: string | null,
    channelExpiration: Date | null,
    channelToken: string | null,
  ): Promise<void> {
    const account = await this.repo.findOne({
      where: { ownerId, provider },
    });

    if (!account) {
      throw ApiException.notFound('Integration account not found');
    }

    account.channelId = channelId;
    account.resourceId = resourceId;
    account.channelExpiration = channelExpiration;
    account.channelToken = channelToken;
    await this.repo.save(account);
  }

  async findByChannelId(
    channelId: string,
    provider: IntegrationProvider = 'google_calendar',
  ): Promise<IntegrationAccount | null> {
    return this.repo.findOne({
      where: { channelId, provider, status: 'connected' },
    });
  }

  async findAccountsNeedingWatchRenewal(
    provider: IntegrationProvider = 'google_calendar',
    thresholdHours: number = 24,
  ): Promise<IntegrationAccount[]> {
    const threshold = new Date(Date.now() + thresholdHours * 60 * 60 * 1000);
    return this.repo
      .createQueryBuilder('account')
      .where('account.provider = :provider', { provider })
      .andWhere('account.status = :status', { status: 'connected' })
      .andWhere('(account.channelExpiration IS NULL OR account.channelExpiration <= :threshold)', {
        threshold,
      })
      .getMany();
  }

  async findConnectedAccounts(
    provider: IntegrationProvider = 'google_calendar',
  ): Promise<IntegrationAccount[]> {
    return this.repo.find({
      where: { provider, status: 'connected' },
    });
  }
}
