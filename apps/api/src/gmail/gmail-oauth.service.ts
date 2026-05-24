import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { GmailAccount } from './gmail-account.entity';
import { GmailTokenService, Provider, TokenResponse } from './gmail-token.service';
import { GoogleOAuthConfig } from './google-oauth.config';
import { MicrosoftOAuthConfig } from './microsoft-oauth.config';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';
import { AuthorizeUrlResponseDto } from './dto/gmail-dtos';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Provider-aware OAuth. state = `${userId}:${provider}:${nonce}`. Both Google
 * and Microsoft use the same backend callback; provider is read from state.
 */
@Injectable()
export class GmailOAuthService {
  constructor(
    private readonly google: GoogleOAuthConfig,
    private readonly microsoft: MicrosoftOAuthConfig,
    private readonly tokens: GmailTokenService,
    private readonly crypto: CryptoService,
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
  ) {}

  buildAuthorizeUrl(userId: string, provider: Provider): AuthorizeUrlResponseDto {
    const state = `${userId}:${provider}:${this.randomNonce()}`;
    if (provider === 'microsoft') {
      if (!this.microsoft.isConfigured()) {
        throw ApiException.badRequest('Microsoft client not configured');
      }
      const params = new URLSearchParams({
        client_id: this.microsoft.clientId!,
        redirect_uri: this.microsoft.redirectUri,
        response_type: 'code',
        scope: this.microsoft.scope,
        response_mode: 'query',
        prompt: 'consent',
        state,
      });
      return { url: `${this.microsoft.authorizeUrl}?${params.toString()}`, state };
    }
    if (!this.google.isConfigured()) {
      throw ApiException.badRequest('Google client not configured');
    }
    const params = new URLSearchParams({
      client_id: this.google.clientId!,
      redirect_uri: this.google.redirectUri,
      response_type: 'code',
      scope: this.google.scope,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { url: `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`, state };
  }

  async completeWebCallback(
    userId: string,
    provider: Provider,
    code: string,
    state: string,
  ): Promise<GmailAccount> {
    this.verifyState(userId, state);
    const redirectUri =
      provider === 'microsoft' ? this.microsoft.redirectUri : this.google.redirectUri;
    const t = await this.tokens.exchangeCode(provider, code, redirectUri);
    return this.persist(userId, provider, t);
  }

  async completeMobileCallback(
    userId: string,
    provider: Provider,
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<GmailAccount> {
    const t = await this.tokens.exchangeCode(provider, code, redirectUri, codeVerifier);
    return this.persist(userId, provider, t);
  }

  private async persist(
    userId: string,
    provider: Provider,
    t: TokenResponse,
  ): Promise<GmailAccount> {
    if (!t.accessToken) throw ApiException.badRequest('OAuth returned no access token');
    const info = await this.tokens.userInfo(provider, t.accessToken);
    const email = info.email;
    if (!email) throw ApiException.badRequest('OAuth userinfo missing email');

    // include soft-deleted so reconnecting a previously-removed account
    // restores that row instead of colliding on the unique key.
    const existing = await this.accounts.findOne({
      where: { ownerId: userId, email, provider },
      withDeleted: true,
    });
    const acc = existing ?? this.accounts.create({ ownerId: userId, email, provider });

    acc.deletedAt = null;
    acc.provider = provider;
    acc.email = email;
    acc.displayName = info.name ?? email;
    acc.accessTokenEnc = this.crypto.encrypt(t.accessToken) ?? '';
    if (t.refreshToken) {
      acc.refreshTokenEnc = this.crypto.encrypt(t.refreshToken);
    }
    if (t.expiresIn) {
      acc.tokenExpiresAt = new Date(Date.now() + t.expiresIn * 1000);
    }
    acc.scopes = t.scope ?? null;
    return this.accounts.save(acc);
  }

  private verifyState(userId: string, state: string): void {
    if (!state || !state.startsWith(`${userId}:`)) {
      throw ApiException.badRequest('Invalid OAuth state');
    }
  }

  private randomNonce(): string {
    return randomBytes(16).toString('base64url');
  }
}
