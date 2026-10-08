import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, Auth } from 'googleapis';
import { ApiException } from '../common/api.exception';

/**
 * Google Calendar API configuration & OAuth2Client factory.
 * Follows the graceful degradation pattern: logs a warning if env vars are missing
 * instead of crashing application startup.
 */
@Injectable()
export class GoogleCalendarConfig {
  private readonly logger = new Logger(GoogleCalendarConfig.name);

  constructor(private readonly config: ConfigService) {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Google Calendar integration is unconfigured (missing GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, or GOOGLE_CALENDAR_REDIRECT_URI)',
      );
    }
  }

  get clientId(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_CLIENT_ID') || undefined;
  }

  get clientSecret(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET') || undefined;
  }

  get redirectUri(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_REDIRECT_URI') || undefined;
  }

  /**
   * Public HTTPS URL Google pushes Calendar notifications to — must end in
   * the real route, `/hooks/gcal` (registered outside the `/api` prefix, see
   * main.ts). Optional: without it push notifications are simply not
   * registered and the 5-minute pg-boss poll keeps sync working.
   */
  get webhookUrl(): string | undefined {
    return this.config.get<string>('GOOGLE_CALENDAR_WEBHOOK_URL') || undefined;
  }

  /** Web app origin the OAuth callback sends the browser back to. */
  get webUrl(): string {
    return (this.config.get<string>('HUSREVITY_WEB_URL') || 'http://localhost:3090').replace(
      /\/+$/,
      '',
    );
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  createOAuth2Client(): Auth.OAuth2Client {
    if (!this.isConfigured()) {
      throw ApiException.badRequest('Google Calendar integration is not configured');
    }
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }
}
