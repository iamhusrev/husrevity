import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';
import { TrashListQueryDto } from './dto/trash-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('TrashController contract', () => {
  let controller: TrashController;
  let service: { list: jest.Mock };

  const user: AuthenticatedUser = { userId: '42', email: 'u@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const module = await Test.createTestingModule({
      controllers: [TrashController],
      providers: [{ provide: TrashService, useValue: service }],
    }).compile();
    controller = module.get(TrashController);
  });

  it('GET /trash passes the caller id and the validated query to the service', async () => {
    const query = Object.assign(new TrashListQueryDto(), {
      kind: ['task', 'goal'],
      since: '2026-03-01T00:00:00.000Z',
      limit: 5,
      cursor: 'abc',
    });

    const res = await controller.list(user, query);

    expect(service.list).toHaveBeenCalledWith('42', {
      kinds: ['task', 'goal'],
      since: '2026-03-01T00:00:00.000Z',
      limit: 5,
      cursor: 'abc',
    });
    expect(res).toEqual({ items: [], nextCursor: null });
  });

  it('GET /trash with no query defaults to all kinds and limit 20', async () => {
    await controller.list(user, plainToInstance(TrashListQueryDto, {}));

    expect(service.list).toHaveBeenCalledWith('42', {
      kinds: undefined,
      since: undefined,
      limit: 20,
      cursor: undefined,
    });
  });

  describe('TrashListQueryDto validation (global ValidationPipe: whitelist + transform)', () => {
    const check = async (raw: Record<string, unknown>) => {
      const dto = plainToInstance(TrashListQueryDto, raw);
      const errors = await validate(dto, { whitelist: true });
      return { dto, errors };
    };

    it('accepts a single kind and normalizes it to an array', async () => {
      const { dto, errors } = await check({ kind: 'task' });
      expect(errors).toHaveLength(0);
      expect(dto.kind).toEqual(['task']);
    });

    it('accepts a repeated kind as an array', async () => {
      const { dto, errors } = await check({ kind: ['task', 'calendar_event'] });
      expect(errors).toHaveLength(0);
      expect(dto.kind).toEqual(['task', 'calendar_event']);
    });

    it('rejects an unknown kind (including anything outside the fixed allow-list)', async () => {
      for (const kind of ['note', 'item', 'secret', ['task', 'note']]) {
        const { errors } = await check({ kind });
        expect(errors.map((e) => e.property)).toEqual(['kind']);
      }
    });

    it('rejects an invalid since and accepts an ISO date-time', async () => {
      expect((await check({ since: 'yesterday' })).errors.map((e) => e.property)).toEqual([
        'since',
      ]);
      expect(
        (await check({ since: '2026-13-45T00:00:00Z' })).errors.map((e) => e.property),
      ).toEqual(['since']);
      expect((await check({ since: '2026-03-01T00:00:00.000Z' })).errors).toHaveLength(0);
    });

    it('coerces limit from the query string and enforces 1..100 with default 20', async () => {
      expect((await check({})).dto.limit).toBe(20);
      expect((await check({ limit: '7' })).dto.limit).toBe(7);
      for (const limit of ['0', '101', 'abc', '2.5']) {
        expect((await check({ limit })).errors.map((e) => e.property)).toEqual(['limit']);
      }
    });

    it('rejects a non-string or oversized cursor', async () => {
      expect((await check({ cursor: 'x'.repeat(513) })).errors.map((e) => e.property)).toEqual([
        'cursor',
      ]);
      expect((await check({ cursor: 'eyJkIjoiIn0' })).errors).toHaveLength(0);
    });
  });
});
