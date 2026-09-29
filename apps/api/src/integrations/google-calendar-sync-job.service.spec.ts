import { Test, TestingModule } from '@nestjs/testing';
jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));

import {
  GoogleCalendarSyncJobService,
  GCAL_PERIODIC_SYNC_JOB,
} from './google-calendar-sync-job.service';
import { PgBossService } from '../jobs/pg-boss.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';

describe('GoogleCalendarSyncJobService', () => {
  let service: GoogleCalendarSyncJobService;
  let mockPgBossService: {
    isReady: jest.Mock;
    schedule: jest.Mock;
    work: jest.Mock;
  };
  let mockSyncService: {
    syncAllConnectedAccounts: jest.Mock;
  };

  beforeEach(async () => {
    mockPgBossService = {
      isReady: jest.fn().mockReturnValue(true),
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue('work-id-123'),
    };

    mockSyncService = {
      syncAllConnectedAccounts: jest.fn().mockResolvedValue({
        total: 2,
        successful: 2,
        failed: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarSyncJobService,
        { provide: PgBossService, useValue: mockPgBossService },
        { provide: GoogleCalendarSyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<GoogleCalendarSyncJobService>(GoogleCalendarSyncJobService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip job registration when pgBoss is not ready', async () => {
    mockPgBossService.isReady.mockReturnValueOnce(false);

    await service.onModuleInit();

    expect(mockPgBossService.schedule).not.toHaveBeenCalled();
    expect(mockPgBossService.work).not.toHaveBeenCalled();
  });

  it('should register schedule and worker when pgBoss is ready', async () => {
    await service.onModuleInit();

    expect(mockPgBossService.schedule).toHaveBeenCalledWith(
      GCAL_PERIODIC_SYNC_JOB,
      '*/5 * * * *',
    );
    expect(mockPgBossService.work).toHaveBeenCalledWith(
      GCAL_PERIODIC_SYNC_JOB,
      expect.any(Function),
    );
  });

  it('should trigger syncAllConnectedAccounts when worker handler executes', async () => {
    let workerHandler: Function | null = null;
    mockPgBossService.work.mockImplementationOnce(async (jobName, handler) => {
      workerHandler = handler;
      return 'work-id-123';
    });

    await service.onModuleInit();

    expect(workerHandler).not.toBeNull();
    await (workerHandler as unknown as Function)();

    expect(mockSyncService.syncAllConnectedAccounts).toHaveBeenCalledTimes(1);
  });

  it('should catch and log error if schedule or work fails during onModuleInit', async () => {
    mockPgBossService.schedule.mockRejectedValueOnce(new Error('pg-boss internal error'));

    await expect(service.onModuleInit()).resolves.not.toThrow();
  });

  it('should trigger syncAllConnectedAccounts directly when runNow is called', async () => {
    const res = await service.runNow();

    expect(res).toEqual({
      total: 2,
      successful: 2,
      failed: 0,
    });
    expect(mockSyncService.syncAllConnectedAccounts).toHaveBeenCalledTimes(1);
  });
});
