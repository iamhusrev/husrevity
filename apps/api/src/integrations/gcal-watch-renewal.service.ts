import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarEngineService } from './google-calendar-engine.service';

@Injectable()
export class GcalWatchRenewalService {
  private readonly logger = new Logger(GcalWatchRenewalService.name);

  constructor(
    private readonly integrationAccountService: IntegrationAccountService,
    private readonly googleCalendarService: GoogleCalendarService,
    @Optional() private readonly engine?: GoogleCalendarEngineService,
  ) {}

  /**
   * Hourly cron job that checks active Google Calendar integration accounts
   * and renews watch channels expiring within 24 hours (or missing/expired).
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'gcal-watch-renewal' })
  async renewWatchChannels(): Promise<number> {
    this.logger.debug('Running scheduled Google Calendar watch channel renewal check...');

    const due = await this.integrationAccountService.findAccountsNeedingWatchRenewal(
      'google_calendar',
      24,
    );
    // The legacy watch channel is never renewed for an owner on the v2 engine or with a narrowed grant.
    const accounts: typeof due = [];
    for (const account of due) {
      if ((await this.engine?.legacyEngineAllowed(account.ownerId)) !== false) accounts.push(account);
    }

    if (accounts.length === 0) {
      this.logger.debug('No Google Calendar watch channels require renewal');
      return 0;
    }

    this.logger.log(`Found ${accounts.length} Google Calendar watch channel(s) needing renewal`);
    let renewedCount = 0;

    for (const account of accounts) {
      try {
        const result = await this.googleCalendarService.registerWatchChannel(account.ownerId);
        if (result) {
          renewedCount++;
          this.logger.log(
            `Successfully renewed watch channel for owner ${account.ownerId} (expires: ${result.expiration.toISOString()})`,
          );
        } else {
          this.logger.warn(`Watch channel renewal returned null for owner ${account.ownerId}`);
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to renew watch channel for owner ${account.ownerId}: ${error?.message}`,
          error?.stack,
        );
      }
    }

    return renewedCount;
  }
}
