import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelegramConfig } from './telegram.config';
import { TelegramApiService } from './telegram-api.service';
import { TelegramMessageHandlerService } from './telegram-message-handler.service';

/**
 * Long-polling service for Telegram Bot API updates.
 * Periodically fetches incoming updates and delegates them to TelegramMessageHandlerService.
 */
@Injectable()
export class TelegramPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollerService.name);
  private isPolling = false;
  private offset: number | undefined = undefined;
  private pollingPromise: Promise<void> | null = null;

  constructor(
    private readonly telegramConfig: TelegramConfig,
    private readonly telegramApiService: TelegramApiService,
    private readonly telegramMessageHandlerService: TelegramMessageHandlerService,
  ) {}

  onModuleInit(): void {
    if (!this.telegramConfig.isConfigured()) {
      this.logger.warn('Telegram poller skipped: TELEGRAM_BOT_TOKEN is not configured');
      return;
    }

    this.isPolling = true;
    this.pollingPromise = this.startPollingLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.isPolling = false;
    if (this.pollingPromise) {
      await this.pollingPromise;
    }
  }

  getIsPolling(): boolean {
    return this.isPolling;
  }

  getOffset(): number | undefined {
    return this.offset;
  }

  /**
   * Continuous long-polling loop.
   */
  private async startPollingLoop(): Promise<void> {
    this.logger.log('Starting Telegram bot long-polling loop');
    while (this.isPolling) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error(`Unexpected error in Telegram polling loop: ${(err as Error).message}`);
        if (this.isPolling) {
          await this.delay(1000);
        }
      }
    }
    this.logger.log('Telegram bot long-polling loop stopped');
  }

  /**
   * Fetches updates once from Telegram API and processes them.
   */
  async pollOnce(): Promise<void> {
    const updates = await this.telegramApiService.getUpdates(this.offset, 30);
    if (!updates || updates.length === 0) {
      return;
    }

    for (const update of updates) {
      if (!this.isPolling) {
        break;
      }
      try {
        await this.telegramMessageHandlerService.handleUpdate(update);
      } catch (err) {
        this.logger.error(
          `Error handling update ${update.update_id}: ${(err as Error).message}`,
        );
      }
      this.offset = update.update_id + 1;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
