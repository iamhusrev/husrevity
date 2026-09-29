import { Injectable, Logger } from '@nestjs/common';
import { parseQuickAdd } from '@husrevity/parser';
import { SlackApiService } from './slack-api.service';
import { SlackLinkService } from './slack-link.service';
import { ItemService } from '../item/item.service';

@Injectable()
export class SlackMessageHandlerService {
  private readonly logger = new Logger(SlackMessageHandlerService.name);

  constructor(
    private readonly slackApiService: SlackApiService,
    private readonly slackLinkService: SlackLinkService,
    private readonly itemService: ItemService,
  ) {}

  /**
   * Processes a single event payload received via Slack Socket Mode or Events API.
   * Handles DM message events only, ignoring bot messages and message subtypes.
   */
  async handleEvent(payload: Record<string, any>): Promise<void> {
    try {
      const event = payload?.event || payload;
      if (!event || event.type !== 'message' || event.channel_type !== 'im') {
        return;
      }

      // Ignore messages sent by bots or message subtypes (e.g. edits, deletes)
      if (event.bot_id || event.subtype) {
        return;
      }

      const text = typeof event.text === 'string' ? event.text.trim() : '';
      if (!text) {
        return;
      }

      const channel = event.channel;
      const slackUserId = event.user;
      if (!channel || !slackUserId) {
        return;
      }

      const parts = text.split(/\s+/);
      const firstWord = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      if (firstWord === 'link') {
        await this.handleLinkCommand(channel, slackUserId, arg);
        return;
      }

      if (firstWord === 'unlink') {
        await this.handleUnlinkCommand(channel, slackUserId);
        return;
      }

      // Any other message text: check if Slack user is linked
      const link = await this.slackLinkService.findBySlackUser(slackUserId);
      if (!link || link.status !== 'linked') {
        await this.slackApiService.postMessage(
          channel,
          'Lütfen önce Husrevity hesabınızı bağlayın. Kodu `link <code>` şeklinde gönderebilirsiniz.',
        );
        return;
      }

      await this.handleQuickAdd(channel, link.ownerId, text);
    } catch (err) {
      this.logger.error(
        `Unexpected error handling Slack message event: ${(err as Error).message}`,
      );
    }
  }

  private async handleLinkCommand(
    channel: string,
    slackUserId: string,
    code: string,
  ): Promise<void> {
    if (!code) {
      await this.slackApiService.postMessage(
        channel,
        'Lütfen hesabınızı bağlamak için web uygulamasından aldığınız kodu girin:\n`link <code>`',
      );
      return;
    }

    try {
      await this.slackLinkService.confirmLink(code, slackUserId);
      await this.slackApiService.postMessage(
        channel,
        '✅ Slack hesabınız Husrevity ile başarıyla bağlandı! Artık mesaj göndererek görev ekleyebilirsiniz.',
      );
    } catch (err) {
      const msg = (err as Error).message || 'Geçersiz veya süresi dolmuş kod.';
      await this.slackApiService.postMessage(
        channel,
        `❌ Bağlama başarısız: ${msg}`,
      );
    }
  }

  private async handleUnlinkCommand(
    channel: string,
    slackUserId: string,
  ): Promise<void> {
    try {
      await this.slackLinkService.unlink(undefined, slackUserId);
      await this.slackApiService.postMessage(
        channel,
        '✅ Slack hesabınızın bağlantısı kaldırıldı.',
      );
    } catch (err) {
      const msg = (err as Error).message || 'Bağlı hesap bulunamadı.';
      await this.slackApiService.postMessage(
        channel,
        `❌ Bağı kaldırma başarısız: ${msg}`,
      );
    }
  }

  private async handleQuickAdd(
    channel: string,
    ownerId: string,
    text: string,
  ): Promise<void> {
    try {
      const draft = await parseQuickAdd(text);
      const item = await this.itemService.create(ownerId, {
        kind: 'task',
        title: draft.title,
        context: draft.context ?? null,
        scheduledAt: draft.scheduledAt ?? null,
        rrule: draft.rrule ?? null,
        source: 'slack',
      });

      await this.slackApiService.postMessage(
        channel,
        `✅ Görev eklendi: "${item.title}"`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to create item from Slack message: ${(err as Error).message}`,
      );
      await this.slackApiService.postMessage(
        channel,
        `❌ Görev eklenirken bir hata oluştu: ${(err as Error).message}`,
      );
    }
  }
}
