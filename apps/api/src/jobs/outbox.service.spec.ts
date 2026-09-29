import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from './outbox-event.entity';

describe('OutboxService', () => {
  let service: OutboxService;
  let events: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    events = { create: jest.fn((v) => v), save: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [OutboxService, { provide: getRepositoryToken(OutboxEvent), useValue: events }],
    }).compile();
    service = module.get(OutboxService);
  });

  it('writes an unprocessed row with the given type/payload', async () => {
    await service.write('item.created', { id: '1' });

    expect(events.create).toHaveBeenCalledWith({
      type: 'item.created',
      payload: { id: '1' },
      processedAt: null,
    });
    expect(events.save).toHaveBeenCalled();
  });
});
