jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));
import {
  GCAL_CLEANUP_FALLBACK_INTERVAL_MS,
  GCAL_CLEANUP_READINESS_MAX_ATTEMPTS,
  GCAL_CLEANUP_READINESS_RETRY_MS,
  GCAL_V2_REVOKE_RETRY_JOB,
  GoogleCalendarLifecycleJobService,
} from './google-calendar-lifecycle-job.service';

describe('GoogleCalendarLifecycleJobService', () => {
  const make = (enabled: boolean, ready = true) => {
    const boss = {
      isReady: jest.fn().mockReturnValue(ready),
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue('id'),
    };
    const lifecycle = {
      isEnabled: jest.fn().mockReturnValue(enabled),
      retryPendingRevokes: jest.fn().mockResolvedValue({ revoked: 0, failed: 0, abandoned: 0 }),
    };
    const publisher = {
      sweepPendingDeletes: jest.fn().mockResolvedValue({ removed: 0, failed: 0, abandoned: 0 }),
    };
    return {
      boss,
      lifecycle,
      publisher,
      svc: new GoogleCalendarLifecycleJobService(boss as never, lifecycle as never, publisher as never),
    };
  };

  it.each([false, true])('schedules the cleanup job whatever the v2 flag says (flag %s)', async (enabled) => {
    const { boss, svc } = make(enabled);
    await svc.onModuleInit();
    expect(boss.schedule).toHaveBeenCalledWith(GCAL_V2_REVOKE_RETRY_JOB, '*/10 * * * *');
    expect(boss.work).toHaveBeenCalledTimes(1);
  });

  it('runs the revoke retry and the publication delete sweep, also with the flag off', async () => {
    const { boss, lifecycle, publisher, svc } = make(false);
    await svc.onModuleInit();
    await boss.work.mock.calls[0][1]();
    expect(lifecycle.retryPendingRevokes).toHaveBeenCalledTimes(1);
    expect(publisher.sweepPendingDeletes).toHaveBeenCalledTimes(1);
  });

  it('still runs the sweep when the revoke retry throws, and rethrows nothing swallowed silently', async () => {
    const { boss, lifecycle, publisher, svc } = make(true);
    lifecycle.retryPendingRevokes.mockRejectedValueOnce(new Error('db down'));
    await svc.onModuleInit();
    await expect(boss.work.mock.calls[0][1]()).rejects.toThrow('db down');
    expect(publisher.sweepPendingDeletes).toHaveBeenCalledTimes(1);
  });

  describe('pg-boss not ready at boot', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('registers the job once pg-boss becomes ready and never starts the in-process fallback', async () => {
      const { boss, lifecycle, publisher, svc } = make(true, false);
      await svc.onModuleInit();
      expect(boss.schedule).not.toHaveBeenCalled();

      boss.isReady.mockReturnValue(true);
      await jest.advanceTimersByTimeAsync(GCAL_CLEANUP_READINESS_RETRY_MS);

      expect(boss.schedule).toHaveBeenCalledWith(GCAL_V2_REVOKE_RETRY_JOB, '*/10 * * * *');
      expect(boss.work).toHaveBeenCalledTimes(1);
      // Neither the retry timer nor a fallback interval keeps running afterwards.
      await jest.advanceTimersByTimeAsync(GCAL_CLEANUP_FALLBACK_INTERVAL_MS * 2);
      expect(boss.work).toHaveBeenCalledTimes(1);
      expect(lifecycle.retryPendingRevokes).not.toHaveBeenCalled();
      expect(publisher.sweepPendingDeletes).not.toHaveBeenCalled();
      await svc.onModuleDestroy();
    });

    it('falls back to an in-process interval when pg-boss never becomes ready, so a pending revoke and delete still run', async () => {
      const { boss, lifecycle, publisher, svc } = make(true, false);
      await svc.onModuleInit();

      await jest.advanceTimersByTimeAsync(GCAL_CLEANUP_READINESS_RETRY_MS * GCAL_CLEANUP_READINESS_MAX_ATTEMPTS);
      expect(boss.schedule).not.toHaveBeenCalled();
      expect(lifecycle.retryPendingRevokes).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(GCAL_CLEANUP_FALLBACK_INTERVAL_MS);
      expect(lifecycle.retryPendingRevokes).toHaveBeenCalledTimes(1);
      expect(publisher.sweepPendingDeletes).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(GCAL_CLEANUP_FALLBACK_INTERVAL_MS);
      expect(lifecycle.retryPendingRevokes).toHaveBeenCalledTimes(2);
      expect(boss.work).not.toHaveBeenCalled();
      await svc.onModuleDestroy();
    });

    it('the fallback still runs the sweep when the revoke retry throws, and keeps running', async () => {
      const { lifecycle, publisher, svc } = make(true, false);
      lifecycle.retryPendingRevokes.mockRejectedValueOnce(new Error('db down'));
      await svc.onModuleInit();
      await jest.advanceTimersByTimeAsync(
        GCAL_CLEANUP_READINESS_RETRY_MS * GCAL_CLEANUP_READINESS_MAX_ATTEMPTS + GCAL_CLEANUP_FALLBACK_INTERVAL_MS * 2,
      );
      expect(publisher.sweepPendingDeletes).toHaveBeenCalledTimes(2);
      expect(lifecycle.retryPendingRevokes).toHaveBeenCalledTimes(2);
      await svc.onModuleDestroy();
    });

    it('onModuleDestroy stops every timer', async () => {
      const { lifecycle, svc } = make(true, false);
      await svc.onModuleInit();
      await svc.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(
        GCAL_CLEANUP_READINESS_RETRY_MS * GCAL_CLEANUP_READINESS_MAX_ATTEMPTS + GCAL_CLEANUP_FALLBACK_INTERVAL_MS * 3,
      );
      expect(lifecycle.retryPendingRevokes).not.toHaveBeenCalled();
    });
  });
});
