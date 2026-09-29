import { Injectable, Logger } from '@nestjs/common';
import { TelegramApiService, TelegramUpdate } from './telegram-api.service';
import { TelegramLinkService } from './telegram-link.service';
import { ItemService } from '../item/item.service';
import { ReminderService } from '../reminder/reminder.service';
import { addFromChatMessage, chatQuickAddReply } from '../common/chat-quick-add';

@Injectable()
export class TelegramMessageHandlerService {
  private readonly logger = new Logger(TelegramMessageHandlerService.name);

  constructor(
    private readonly telegramApiService: TelegramApiService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly itemService: ItemService,
    private readonly reminderService: ReminderService,
  ) {}

  /**
   * Processes a single incoming update from Telegram Bot API.
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message || !message.text || !message.chat) {
      return;
    }

    const chatId = String(message.chat.id);
    const rawText = message.text.trim();
    if (!rawText) {
      return;
    }

    const parts = rawText.split(/\s+/);
    const rawCmd = parts[0];
    const cmd = rawCmd.split('@')[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    if (cmd === '/start' || cmd === '/link') {
      await this.handleLinkCommand(chatId, arg);
      return;
    }

    if (cmd === '/unlink') {
      await this.handleUnlinkCommand(chatId);
      return;
    }

    // Any other text from a linked or unlinked chat:
    const link = await this.telegramLinkService.findByChatId(chatId);
    if (!link || link.status !== 'linked') {
      await this.telegramApiService.sendMessage(
        chatId,
        'Lütfen önce Husrevity hesabınızı bağlayın. Kodu `/link <code>` veya `/start <code>` şeklinde gönderebilirsiniz.',
      );
      return;
    }

    await this.handleQuickAdd(chatId, link.ownerId, rawText);
  }

  private async handleLinkCommand(chatId: string, code: string): Promise<void> {
    if (!code) {
      const existing = await this.telegramLinkService.findByChatId(chatId);
      if (existing) {
        await this.telegramApiService.sendMessage(
          chatId,
          'Husrevity hesabınız zaten bağlı. Bağlantıyı kaldırmak için `/unlink` komutunu kullanabilirsiniz.',
        );
      } else {
        await this.telegramApiService.sendMessage(
          chatId,
          'Lütfen hesabınızı bağlamak için web uygulamasından aldığınız kodu girin:\n`/link <code>` veya `/start <code>`',
        );
      }
      return;
    }

    try {
      await this.telegramLinkService.confirmLink(code, chatId);
      await this.telegramApiService.sendMessage(
        chatId,
        '✅ Telegram hesabınız Husrevity ile başarıyla bağlandı! Artık mesaj göndererek anımsatıcı ekleyebilirsiniz.',
      );
    } catch (err) {
      const msg = (err as Error).message || 'Geçersiz veya süresi dolmuş kod.';
      await this.telegramApiService.sendMessage(chatId, `❌ Bağlama başarısız: ${msg}`);
    }
  }

  private async handleUnlinkCommand(chatId: string): Promise<void> {
    try {
      await this.telegramLinkService.unlink(undefined, chatId);
      await this.telegramApiService.sendMessage(
        chatId,
        '✅ Telegram hesabınızın bağlantısı kaldırıldı.',
      );
    } catch (err) {
      const msg = (err as Error).message || 'Bağlı hesap bulunamadı.';
      await this.telegramApiService.sendMessage(chatId, `❌ Bağı kaldırma başarısız: ${msg}`);
    }
  }

  private async handleQuickAdd(chatId: string, ownerId: string, text: string): Promise<void> {
    try {
      const result = await addFromChatMessage(
        this.reminderService,
        this.itemService,
        ownerId,
        text,
        'telegram',
      );
      await this.telegramApiService.sendMessage(chatId, chatQuickAddReply(result));
    } catch (err) {
      this.logger.error(`Failed to create reminder from Telegram message: ${(err as Error).message}`);
      await this.telegramApiService.sendMessage(
        chatId,
        `❌ Anımsatıcı eklenirken bir hata oluştu: ${(err as Error).message}`,
      );
    }
  }
}
