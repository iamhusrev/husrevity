import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgBossService } from '../jobs/pg-boss.service';
import { GoogleCalendarReadSyncService } from './google-calendar-read-sync.service';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';

export const GCAL_V2_DUE_SYNC_JOB = 'gcal-v2-due-sync';
export const GCAL_V2_WINDOW_ADVANCE_JOB = 'gcal-v2-window-advance';
export const GCAL_V2_CHANNEL_RENEWAL_JOB = 'gcal-v2-channel-renewal';

/**
 * Registers the pg-boss jobs of the new read engine. Nothing is scheduled
 * while GOOGLE_CALENDAR_V2_ENABLED is not the literal `true`. Webhook
 * coalescing: a webhook only sets `needs_sync_at`; the minute job syncs each
 * flagged subscription once however many notifications arrived.
 */
@Injectable()
export class GoogleCalendarReadSyncJobService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarReadSyncJobService.name);

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly engine: GoogleCalendarReadSyncService,
    private readonly channels: GoogleCalendarSelectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.engine.isEnabled()) return;
    if (!this.pgBoss.isReady()) {
      this.logger.warn('pg-boss is not ready; skipping Google Calendar v2 job registration');
      return;
    }
    try {
      await this.pgBoss.schedule(GCAL_V2_DUE_SYNC_JOB, '* * * * *');
      await this.pgBoss.work(GCAL_V2_DUE_SYNC_JOB, async () => {
        await this.engine.runDueSyncs();
      });
      await this.pgBoss.schedule(GCAL_V2_WINDOW_ADVANCE_JOB, '23 3 * * *');
      await this.pgBoss.work(GCAL_V2_WINDOW_ADVANCE_JOB, async () => {
        await this.engine.advanceDueWindows();
      });
      await this.pgBoss.schedule(GCAL_V2_CHANNEL_RENEWAL_JOB, '*/10 * * * *');
      await this.pgBoss.work(GCAL_V2_CHANNEL_RENEWAL_JOB, async () => {
        await this.channels.renewDueChannels();
      });
      this.logger.log('Registered Google Calendar v2 jobs (sync every 1m, channel renewal every 10m, window advance daily)');
    } catch (err) {
      this.logger.error(`Failed to register Google Calendar v2 jobs: ${(err as Error).message}`);
    }
  }
}
