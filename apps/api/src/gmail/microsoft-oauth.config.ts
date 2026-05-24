import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Microsoft (Azure AD / Entra) OAuth config — Outlook mail/calendar/contacts
 * via Microsoft Graph. Mirrors GoogleOAuthConfig. Tenant 'common' = any
 * personal or work Microsoft account. Reuses the same backend callback as
 * Google (`/api/gmail/oauth/callback`); the provider is carried in `state`.
 */
@Injectable()
export class MicrosoftOAuthConfig {
  constructor(private readonly config: ConfigService) {}

  get clientId(): string | undefined {
    return this.config.get<string>('MICROSOFT_CLIENT_ID') || undefined;
  }

  get clientSecret(): string | undefined {
    return this.config.get<string>('MICROSOFT_CLIENT_SECRET') || undefined;
  }

  get redirectUri(): string {
    return (
      this.config.get<string>('MICROSOFT_REDIRECT_URI') ??
      'http://localhost:4090/api/gmail/oauth/callback'
    );
  }

  get scope(): string {
    return (
      this.config.get<string>('MICROSOFT_OAUTH_SCOPE') ??
      'offline_access User.Read Mail.ReadWrite Mail.Send Calendars.Read Contacts.Read'
    );
  }

  get tenant(): string {
    return this.config.get<string>('MICROSOFT_TENANT') ?? 'common';
  }

  get authorizeUrl(): string {
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`;
  }

  get tokenUrl(): string {
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
  }

  get webUrl(): string {
    return this.config.get<string>('HUSREVITY_WEB_URL') ?? 'http://localhost:3090';
  }

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }
}
