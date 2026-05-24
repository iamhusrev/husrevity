import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Spring's @ConfigurationProperties("husrevity.google") muadili.
 * Tüm Google OAuth ayarlarını tek bir tipli sınıftan okur.
 */
@Injectable()
export class GoogleOAuthConfig {
  constructor(private readonly config: ConfigService) {}

  get clientId(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_ID') || undefined;
  }

  get clientSecret(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET') || undefined;
  }

  get redirectUri(): string {
    return (
      this.config.get<string>('GOOGLE_REDIRECT_URI') ??
      'http://localhost:4090/api/gmail/oauth/callback'
    );
  }

  get mobileRedirectUri(): string {
    return this.config.get<string>('GOOGLE_MOBILE_REDIRECT_URI') ?? 'husrevity://oauth/callback';
  }

  get scope(): string {
    return (
      this.config.get<string>('GOOGLE_OAUTH_SCOPE') ??
      'https://www.googleapis.com/auth/gmail.modify ' +
        'https://www.googleapis.com/auth/calendar.readonly ' +
        'https://www.googleapis.com/auth/contacts.readonly ' +
        'https://www.googleapis.com/auth/drive.readonly ' +
        'openid email profile'
    );
  }

  /** Where the OAuth callback 302-redirects the browser back to. */
  get webUrl(): string {
    return this.config.get<string>('HUSREVITY_WEB_URL') ?? 'http://localhost:3090';
  }

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }
}
