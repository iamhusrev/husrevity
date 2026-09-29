import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Slack API configuration.
 * Follows the graceful degradation pattern: logs a warning if env vars are missing
 * instead of crashing application startup.
 */
@Injectable()
export class SlackConfig {
  private readonly logger = new Logger(SlackConfig.name);

  constructor(private readonly config: ConfigService) {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Slack integration is unconfigured (missing SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN)',
      );
    }
  }

  get botToken(): string | undefined {
    return this.config.get<string>('SLACK_BOT_TOKEN') || undefined;
  }

  get appToken(): string | undefined {
    return this.config.get<string>('SLACK_APP_TOKEN') || undefined;
  }

  get botUsername(): string | undefined {
    return this.config.get<string>('SLACK_BOT_USERNAME') || undefined;
  }

  isConfigured(): boolean {
    return !!(this.botToken && this.appToken);
  }
}
