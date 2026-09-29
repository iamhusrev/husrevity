import { Controller, Post, Headers, Logger } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { ApiException } from '../common/api.exception';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';

@Controller('hooks/gcal')
export class GcalWebhookController {
  private readonly logger = new Logger(GcalWebhookController.name);

  constructor(
    private readonly integrationAccountService: IntegrationAccountService,
    private readonly syncService: GoogleCalendarSyncService,
  ) {}

  /**
   * Receives Google Calendar push notifications (`events.watch` webhooks).
   * Validates `x-goog-channel-id` and `x-goog-resource-id` headers, resolves the owner account,
   * and triggers incremental pull sync (`syncIncremental`).
   */
  @Public()
  @Post()
  async handleWebhook(
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-resource-id') resourceId?: string,
    @Headers('x-goog-resource-state') resourceState?: string,
    @Headers('x-goog-channel-token') channelToken?: string,
  ) {
    if (!channelId || !resourceId) {
      this.logger.warn('Received Google Calendar webhook missing required headers');
      throw ApiException.badRequest(
        'Missing required Google webhook headers (x-goog-channel-id, x-goog-resource-id)',
      );
    }

    this.logger.log(
      `Received Google Calendar webhook for channel ${channelId} (resourceState: ${resourceState})`,
    );

    const account = await this.integrationAccountService.findByChannelId(channelId);
    if (!account) {
      this.logger.warn(`No active integration account found matching channelId ${channelId}`);
      return { success: false, message: 'Channel not found or inactive' };
    }

    if (account.resourceId && account.resourceId !== resourceId) {
      this.logger.warn(
        `Resource ID mismatch for channel ${channelId}: received ${resourceId}, stored ${account.resourceId}`,
      );
      return { success: false, message: 'Resource ID mismatch' };
    }

    // channelId/resourceId alone aren't secret (channelId embeds ownerId in
    // cleartext — see registerWatchChannel), so a forged request that merely
    // guesses/replays them could still trigger a sync for an arbitrary
    // owner. channelToken is the random per-channel secret Google echoes
    // back verbatim on every genuine notification — reject anything that
    // doesn't match it exactly (or that arrives for a channel that somehow
    // has no token stored, which should never happen for a channel created
    // after this fix, but fails closed rather than silently trusting it).
    if (!account.channelToken || account.channelToken !== channelToken) {
      this.logger.warn(`Channel token mismatch or missing for channel ${channelId}`);
      return { success: false, message: 'Channel token mismatch' };
    }

    // Google sends 'sync' handshake notification when watch channel is created
    if (resourceState === 'sync') {
      this.logger.log(`Received initial sync handshake for owner ${account.ownerId}`);
      return { success: true, message: 'Sync handshake received' };
    }

    try {
      await this.syncService.syncIncremental(account.ownerId);
      this.logger.log(`Incremental sync successfully triggered by webhook for owner ${account.ownerId}`);
      return { success: true, message: 'Incremental sync triggered' };
    } catch (error: any) {
      this.logger.error(
        `Error executing incremental sync triggered by webhook for owner ${account.ownerId}: ${error?.message}`,
        error?.stack,
      );
      return { success: false, message: `Sync failed: ${error?.message}` };
    }
  }
}
