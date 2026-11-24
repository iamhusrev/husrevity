jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));
import {
  GCAL_V2_CHANNEL_RENEWAL_JOB,
  GCAL_V2_DUE_SYNC_JOB,
  GCAL_V2_WINDOW_ADVANCE_JOB,
  GoogleCalendarReadSyncJobService,
} from './google-calendar-read-sync-job.service';

describe('GoogleCalendarReadSyncJobService', () => {
  const make = (enabled: boolean, ready = true) => {
    const boss = {
      isReady: jest.fn().mockReturnValue(ready),
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue('id'),
    };
    const engine = {
      isEnabled: jest.fn().mockReturnValue(enabled),
      runDueSyncs: jest.fn().mockResolvedValue({ attempted: 0, results: [] }),
      advanceDueWindows: jest.fn().mockResolvedValue({ attempted: 0, results: [] }),
    };
    const channels = { renewDueChannels: jest.fn().mockResolvedValue({ attempted: 0, renewed: 0 }) };
    return { boss, engine, channels, svc: new GoogleCalendarReadSyncJobService(boss as never, engine as never, channels as never) };
  };

  it('schedules nothing while the flag is off', async () => {
    const { boss, svc } = make(false);
    await svc.onModuleInit();
    expect(boss.schedule).not.toHaveBeenCalled();
    expect(boss.work).not.toHaveBeenCalled();
  });

  it('schedules the minute job and the daily window advance when enabled', async () => {
    const { boss, engine, svc } = make(true);
    await svc.onModuleInit();
    expect(boss.schedule).toHaveBeenCalledWith(GCAL_V2_DUE_SYNC_JOB, '* * * * *');
    expect(boss.schedule).toHaveBeenCalledWith(GCAL_V2_WINDOW_ADVANCE_JOB, '23 3 * * *');
    const dueHandler = boss.work.mock.calls.find((c) => c[0] === GCAL_V2_DUE_SYNC_JOB)![1];
    await dueHandler();
    expect(engine.runDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('schedules the channel renewal every 10 minutes and runs it', async () => {
    const { boss, channels, svc } = make(true);
    await svc.onModuleInit();
    expect(boss.schedule).toHaveBeenCalledWith(GCAL_V2_CHANNEL_RENEWAL_JOB, '*/10 * * * *');
    const handler = boss.work.mock.calls.find((c) => c[0] === GCAL_V2_CHANNEL_RENEWAL_JOB)![1];
    await handler();
    expect(channels.renewDueChannels).toHaveBeenCalledTimes(1);
  });

  it('skips registration when pg-boss is not ready', async () => {
    const { boss, svc } = make(true, false);
    await svc.onModuleInit();
    expect(boss.schedule).not.toHaveBeenCalled();
  });
});
