import { Injectable, Logger } from '@nestjs/common';
import { Notifier, NotifierPayload } from '../notification/notifier.interface';
import { TelegramLink } from './telegram-link.entity';
import { TelegramApiService } from './telegram-api.service';

/**
 * Notifier implementation for Telegram channel.
 * Calls TelegramApiService.sendMessage to dispatch notification payload
 * to a linked Telegram chat.
 */
@Injectable()
export class TelegramNotifier implements Notifier<TelegramLink> {
  private readonly logger = new Logger(TelegramNotifier.name);

  constructor(private readonly telegramApi: TelegramApiService) {}

  async send(target: TelegramLink, payload: NotifierPayload): Promise<void> {
    if (!target.chatId || target.status !== 'linked') {
      return;
    }

    const text = payload.body ? `${payload.title}\n${payload.body}` : payload.title;

    const result = await this.telegramApi.sendMessage(target.chatId, text);

    if (!result) {
      throw new Error(`Telegram sendMessage failed for chatId ${target.chatId}`);
    }
  }
}
