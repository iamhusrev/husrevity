import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBossService } from '../jobs/pg-boss.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarPublishService } from './google-calendar-publish.service';

export const GCAL_V2_REVOKE_RETRY_JOB = 'gcal-v2-revoke-retry';

/** While pg-boss is not ready the registration is retried this often, at most MAX_ATTEMPTS times. */
export const GCAL_CLEANUP_READINESS_RETRY_MS = 30_000;
export const GCAL_CLEANUP_READINESS_MAX_ATTEMPTS = 10;
/** Cadence of the in-process fallback used when pg-boss never became ready. */
export const GCAL_CLEANUP_FALLBACK_INTERVAL_MS = 10 * 60_000;

/**
 * Cleanup worker, every 10 minutes: retries Google token revokes that failed during
 * a disconnect and removes published Google copies that are queued for deletion.
 * Deliberately NOT gated by GOOGLE_CALENDAR_V2_ENABLED: a disconnect works in every
 * mode and a queued revoke or delete must finish (and the stored token must go)
 * even after the flag was turned off again. Without any pending row both are no-ops.
 *
 * If pg-boss is not ready at boot the registration is retried for a bounded time;
 * when it never becomes ready the same cleanup runs from a plain in-process interval,
 * so a pending token cannot stay stored indefinitely. Both tasks are idempotent, so
 * several instances running the fallback at once is harmless.
 */
@Injectable()
export class GoogleCalendarLifecycleJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarLifecycleJobService.name);
  private retryTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly lifecycle: GoogleCalendarLifecycleService,
    private readonly publisher: GoogleCalendarPublishService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.pgBoss.isReady()) {
      await this.register();
      return;
    }
    this.logger.warn('pg-boss is not ready; retrying the Google Calendar cleanup job registration');
    let attempts = 0;
    this.retryTimer = setInterval(() => {
      attempts += 1;
      if (this.pgBoss.isReady()) {
        this.stopRetry();
        void this.register();
      } else if (attempts >= GCAL_CLEANUP_READINESS_MAX_ATTEMPTS) {
        this.stopRetry();
        this.startFallback();
      }
    }, GCAL_CLEANUP_READINESS_RETRY_MS);
    this.retryTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopRetry();
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  /** The cleanup body shared by the pg-boss worker and the in-process fallback. */
  private async runCleanup(): Promise<void> {
    try {
      await this.lifecycle.retryPendingRevokes();
    } finally {
      // The two tasks are independent: a failing revoke retry never stalls the delete sweep.
      await this.publisher.sweepPendingDeletes();
    }
  }

  private async register(): Promise<void> {
    try {
      await this.pgBoss.schedule(GCAL_V2_REVOKE_RETRY_JOB, '*/10 * * * *');
      await this.pgBoss.work(GCAL_V2_REVOKE_RETRY_JOB, () => this.runCleanup());
      this.logger.log('Registered Google Calendar cleanup job (revoke retry and published-copy removal, every 10m)');
    } catch (err) {
      this.logger.error(`Failed to register the Google Calendar cleanup job: ${(err as Error).message}`);
      this.startFallback();
    }
  }

  private startFallback(): void {
    if (this.fallbackTimer) return;
    this.logger.warn('pg-boss is unavailable; running the Google Calendar cleanup from an in-process interval');
    this.fallbackTimer = setInterval(() => {
      this.runCleanup().catch((err: Error) => {
        this.logger.warn(`Google Calendar cleanup (fallback) failed: ${err.name}`);
      });
    }, GCAL_CLEANUP_FALLBACK_INTERVAL_MS);
    this.fallbackTimer.unref?.();
  }

  private stopRetry(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }
}
