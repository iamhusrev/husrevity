import { Injectable, Logger } from '@nestjs/common';
import { TelegramConfig } from './telegram.config';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Low-level Telegram Bot API HTTP client.
 * Interacts directly with Telegram REST endpoints using native fetch.
 */
@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);
  private readonly baseUrl = 'https://api.telegram.org';

  constructor(private readonly telegramConfig: TelegramConfig) {}

  /**
   * Send a text message to a specific Telegram chat.
   */
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: { parse_mode?: string },
  ): Promise<TelegramMessage | null> {
    if (!this.telegramConfig.isConfigured()) {
      this.logger.warn('Cannot send Telegram message: bot token is not configured');
      return null;
    }

    const token = this.telegramConfig.botToken;
    const url = `${this.baseUrl}/bot${token}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options?.parse_mode,
        }),
      });

      const data = (await response.json()) as TelegramApiResponse<TelegramMessage>;

      if (!data.ok || !data.result) {
        this.logger.error(
          `Telegram sendMessage failed: ${data.description || 'Unknown error'} (code: ${data.error_code})`,
        );
        return null;
      }

      return data.result;
    } catch (err) {
      this.logger.error(`Failed to call Telegram sendMessage API: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Fetch incoming updates from Telegram using long-polling.
   */
  async getUpdates(
    offset?: number,
    timeoutSec = 30,
  ): Promise<TelegramUpdate[]> {
    if (!this.telegramConfig.isConfigured()) {
      this.logger.warn('Cannot fetch Telegram updates: bot token is not configured');
      return [];
    }

    const token = this.telegramConfig.botToken;
    const url = `${this.baseUrl}/bot${token}/getUpdates`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: timeoutSec,
          allowed_updates: ['message'],
        }),
      });

      const data = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>;

      if (!data.ok || !data.result) {
        this.logger.error(
          `Telegram getUpdates failed: ${data.description || 'Unknown error'} (code: ${data.error_code})`,
        );
        return [];
      }

      return data.result;
    } catch (err) {
      this.logger.error(`Failed to call Telegram getUpdates API: ${(err as Error).message}`);
      return [];
    }
  }
}
