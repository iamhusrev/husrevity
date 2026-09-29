import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgBossService } from '../jobs/pg-boss.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';

export const GCAL_PERIODIC_SYNC_JOB = 'gcal-periodic-sync';

@Injectable()
export class GoogleCalendarSyncJobService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarSyncJobService.name);

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly syncService: GoogleCalendarSyncService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.pgBoss.isReady()) {
      this.logger.warn(
        'pg-boss is not ready; skipping Google Calendar periodic sync job registration',
      );
      return;
    }

    try {
      await this.pgBoss.schedule(GCAL_PERIODIC_SYNC_JOB, '*/5 * * * *');
      await this.pgBoss.work(GCAL_PERIODIC_SYNC_JOB, async () => {
        this.logger.log('Starting scheduled Google Calendar periodic pull sync...');
        await this.syncService.syncAllConnectedAccounts();
      });
      this.logger.log('Registered Google Calendar periodic sync job (every 5m)');
    } catch (err) {
      this.logger.error(
        `Failed to register Google Calendar periodic sync job: ${(err as Error).message}`,
      );
    }
  }

  async runNow(): Promise<{ total: number; successful: number; failed: number }> {
    return this.syncService.syncAllConnectedAccounts();
  }
}
