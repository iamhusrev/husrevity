import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { PgBossService } from './pg-boss.service';

// Fake that behaves like pg-boss v10+: send/schedule/work reject for a queue
// that was never created. The previous blanket mock hid exactly that failure.
const createdQueues = new Set<string>();
const requireQueue = (name: string) => {
  if (!createdQueues.has(name)) throw new Error(`Queue ${name} not found`);
};
const createQueue = jest.fn(async (name: string) => {
  createdQueues.add(name);
});

jest.mock('pg-boss', () => ({
  PgBoss: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn(async (name: string) => (createdQueues.has(name) ? { name } : null)),
    createQueue,
    send: jest.fn(async (name: string) => {
      requireQueue(name);
      return 'job-1';
    }),
    schedule: jest.fn(async (name: string) => {
      requireQueue(name);
    }),
    work: jest.fn(async (name: string) => {
      requireQueue(name);
      return 'work-1';
    }),
  })),
}));

describe('PgBossService', () => {
  let service: PgBossService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    createdQueues.clear();
    createQueue.mockClear();
    config = { get: jest.fn().mockReturnValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [PgBossService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get(PgBossService);
  });

  it('is not ready before onModuleInit runs', () => {
    expect(service.isReady()).toBe(false);
  });

  it('becomes ready and can enqueue, schedule, and work after a successful start', async () => {
    await service.onModuleInit();
    expect(service.isReady()).toBe(true);

    const id = await service.enqueue('test-job', { foo: 'bar' });
    expect(id).toBe('job-1');

    await service.schedule('cron-job', '*/5 * * * *');
    const workId = await service.work('cron-job', async () => {});
    expect(workId).toBe('work-1');
  });

  it('creates a missing queue on first use, only once, before send/schedule/work', async () => {
    await service.onModuleInit();

    await service.schedule('gcal-periodic-sync', '*/5 * * * *');
    await service.work('gcal-periodic-sync', async () => {});
    await service.enqueue('gcal-periodic-sync');

    expect(createQueue).toHaveBeenCalledTimes(1);
    expect(createQueue).toHaveBeenCalledWith('gcal-periodic-sync');
  });

  it('does not recreate a queue that already exists from a previous boot', async () => {
    createdQueues.add('outbox-type');
    await service.onModuleInit();

    await service.enqueue('outbox-type', { a: 1 });

    expect(createQueue).not.toHaveBeenCalled();
  });

  it('stays not-ready (never crashes) when start() rejects', async () => {
    (PgBoss as unknown as jest.Mock).mockImplementationOnce(() => ({
      on: jest.fn(),
      start: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      stop: jest.fn(),
    }));

    await service.onModuleInit();

    expect(service.isReady()).toBe(false);
    await expect(service.enqueue('test-job')).rejects.toThrow('pg-boss is not ready');
  });
});
