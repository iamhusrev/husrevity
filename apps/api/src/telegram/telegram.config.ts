import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Telegram Bot API configuration.
 * Follows the graceful degradation pattern: logs a warning if env vars are missing
 * instead of crashing application startup.
 */
@Injectable()
export class TelegramConfig {
  private readonly logger = new Logger(TelegramConfig.name);

  constructor(private readonly config: ConfigService) {
    if (!this.isConfigured()) {
      this.logger.warn('Telegram integration is unconfigured (missing TELEGRAM_BOT_TOKEN)');
    }
  }

  get botToken(): string | undefined {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
  }

  get botUsername(): string | undefined {
    return this.config.get<string>('TELEGRAM_BOT_USERNAME') || undefined;
  }

  isConfigured(): boolean {
    return !!this.botToken;
  }
}
