import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxWorkerService } from './outbox-worker.service';
import { OutboxEvent } from './outbox-event.entity';
import { PgBossService } from './pg-boss.service';

// pg-boss's compiled output is ESM-only — jest can't parse it. This test
// substitutes PgBossService via DI and never touches the real package, but
// pg-boss.service.ts still imports 'pg-boss' at the top of the file, so
// jest needs this mock in place before it tries to load that module graph.
jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));

describe('OutboxWorkerService', () => {
  let service: OutboxWorkerService;
  let events: { find: jest.Mock; save: jest.Mock };
  let pgBoss: { isReady: jest.Mock; enqueue: jest.Mock };

  beforeEach(async () => {
    events = { find: jest.fn().mockResolvedValue([]), save: jest.fn().mockResolvedValue(undefined) };
    pgBoss = { isReady: jest.fn().mockReturnValue(true), enqueue: jest.fn().mockResolvedValue('job-1') };
    const module = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: getRepositoryToken(OutboxEvent), useValue: events },
        { provide: PgBossService, useValue: pgBoss },
      ],
    }).compile();
    service = module.get(OutboxWorkerService);
  });

  it('skips the tick entirely when pg-boss is not ready', async () => {
    pgBoss.isReady.mockReturnValueOnce(false);
    await service.tick();
    expect(events.find).not.toHaveBeenCalled();
  });

  it('enqueues each unprocessed row and marks it processed', async () => {
    const row = { id: '1', type: 'item.created', payload: { id: '5' }, processedAt: null } as OutboxEvent;
    events.find.mockResolvedValueOnce([row]);

    await service.tick();

    expect(pgBoss.enqueue).toHaveBeenCalledWith('item.created', { id: '5' });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', processedAt: expect.any(Date) }),
    );
  });

  it('logs and continues (does not throw) when enqueue fails for one row', async () => {
    const row = { id: '1', type: 'item.created', payload: {}, processedAt: null } as OutboxEvent;
    events.find.mockResolvedValueOnce([row]);
    pgBoss.enqueue.mockRejectedValueOnce(new Error('boom'));

    await expect(service.tick()).resolves.toBeUndefined();
    expect(events.save).not.toHaveBeenCalled();
  });
});
