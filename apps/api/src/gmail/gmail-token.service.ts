import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailAccount } from './gmail-account.entity';
import { GoogleOAuthConfig } from './google-oauth.config';
import { MicrosoftOAuthConfig } from './microsoft-oauth.config';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const MS_ME_URL = 'https://graph.microsoft.com/v1.0/me';

export type Provider = 'google' | 'microsoft';

export interface TokenResponse {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  idToken: string | null;
}

export interface UserInfoResponse {
  email?: string;
  name?: string;
  [k: string]: unknown;
}

/**
 * Provider-aware OAuth token + userinfo over plain fetch (no SDK).
 * Google and Microsoft (Azure/Entra) share this; the endpoints differ.
 */
@Injectable()
export class GmailTokenService {
  private readonly logger = new Logger(GmailTokenService.name);

  constructor(
    private readonly google: GoogleOAuthConfig,
    private readonly microsoft: MicrosoftOAuthConfig,
    private readonly crypto: CryptoService,
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
  ) {}

  exchangeCode(
    provider: Provider,
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<TokenResponse> {
    const form = new URLSearchParams();
    form.append('code', code);
    form.append('redirect_uri', redirectUri);
    form.append('grant_type', 'authorization_code');
    if (codeVerifier) form.append('code_verifier', codeVerifier);

    if (provider === 'microsoft') {
      if (!this.microsoft.isConfigured()) {
        throw ApiException.badRequest('Microsoft client not configured');
      }
      form.append('client_id', this.microsoft.clientId!);
      form.append('client_secret', this.microsoft.clientSecret!);
      form.append('scope', this.microsoft.scope);
      return this.postForTokens(this.microsoft.tokenUrl, form);
    }
    if (!this.google.isConfigured()) {
      throw ApiException.badRequest('Google client not configured');
    }
    form.append('client_id', this.google.clientId!);
    form.append('client_secret', this.google.clientSecret!);
    return this.postForTokens(GOOGLE_TOKEN_URL, form);
  }

  refresh(provider: Provider, refreshToken: string): Promise<TokenResponse> {
    const form = new URLSearchParams();
    form.append('refresh_token', refreshToken);
    form.append('grant_type', 'refresh_token');
    if (provider === 'microsoft') {
      form.append('client_id', this.microsoft.clientId!);
      form.append('client_secret', this.microsoft.clientSecret!);
      form.append('scope', this.microsoft.scope);
      return this.postForTokens(this.microsoft.tokenUrl, form);
    }
    form.append('client_id', this.google.clientId!);
    form.append('client_secret', this.google.clientSecret!);
    return this.postForTokens(GOOGLE_TOKEN_URL, form);
  }

  async userInfo(provider: Provider, accessToken: string): Promise<UserInfoResponse> {
    try {
      if (provider === 'microsoft') {
        const r = await fetch(MS_ME_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as Record<string, string>;
        return { email: j.mail ?? j.userPrincipalName, name: j.displayName };
      }
      const r = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as UserInfoResponse;
    } catch (e) {
      throw ApiException.badRequest(`Failed to fetch userinfo: ${(e as Error).message}`);
    }
  }

  async freshAccessToken(account: GmailAccount): Promise<string> {
    const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
    const needsRefresh = expiresAt < Date.now() + 60_000;
    if (needsRefresh) {
      const refresh = account.refreshTokenEnc ? this.crypto.decrypt(account.refreshTokenEnc) : null;
      if (!refresh) throw ApiException.unauthorized('No refresh token stored');
      const t = await this.refresh(account.provider, refresh);
      if (!t.accessToken) throw ApiException.unauthorized('Refresh failed: no access token');
      account.accessTokenEnc = this.crypto.encrypt(t.accessToken) ?? '';
      if (t.refreshToken) account.refreshTokenEnc = this.crypto.encrypt(t.refreshToken);
      if (t.expiresIn) account.tokenExpiresAt = new Date(Date.now() + t.expiresIn * 1000);
      await this.accounts.save(account);
    }
    const dec = this.crypto.decrypt(account.accessTokenEnc);
    if (!dec) throw ApiException.unauthorized('Cannot decrypt access token');
    return dec;
  }

  private async postForTokens(url: string, form: URLSearchParams): Promise<TokenResponse> {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const json = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return {
        accessToken: (json.access_token as string) ?? null,
        refreshToken: (json.refresh_token as string) ?? null,
        expiresIn: (json.expires_in as number) ?? null,
        scope: (json.scope as string) ?? null,
        idToken: (json.id_token as string) ?? null,
      };
    } catch (e) {
      this.logger.error('OAuth token exchange failed', e);
      throw ApiException.badRequest(`OAuth token exchange failed: ${(e as Error).message}`);
    }
  }
}
