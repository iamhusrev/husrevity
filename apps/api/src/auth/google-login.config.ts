import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Settings for sign-in with Google. Reads through ConfigService only; the
 * client id/secret are shared with the calendar integration (one OAuth client),
 * the redirect URI is login-specific. The feature is OFF unless
 * GOOGLE_LOGIN_ENABLED is literally the string `true`.
 */
@Injectable()
export class GoogleLoginConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('GOOGLE_LOGIN_ENABLED') === 'true';
  }

  get clientId(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_CLIENT_ID') || undefined;
  }

  get clientSecret(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET') || undefined;
  }

  get redirectUri(): string | undefined {
    return this.config.get<string>('GOOGLE_LOGIN_REDIRECT_URI') || undefined;
  }

  get webUrl(): string {
    return (this.config.get<string>('HUSREVITY_WEB_URL') || 'http://localhost:3090').replace(
      /\/+$/,
      '',
    );
  }

  /** Same issuer JwtStrategy expects, used to read an optional Bearer on public routes. */
  get jwtIssuer(): string {
    return this.config.get<string>('HUSREVITY_JWT_ISSUER') ?? 'husrevity-nest';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  /** The flow cookie is only sent to the callback route and is Secure on https. */
  get cookiePath(): string {
    try {
      return new URL(this.redirectUri ?? '').pathname;
    } catch {
      return '/api/auth/google/callback';
    }
  }

  get cookieSecure(): boolean {
    return (this.redirectUri ?? '').startsWith('https://');
  }
}
