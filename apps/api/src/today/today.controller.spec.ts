import { Test } from '@nestjs/testing';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

describe('TodayController', () => {
  let controller: TodayController;
  let today: { dueToday: jest.Mock; timeline: jest.Mock; currentBlock: jest.Mock };

  beforeEach(async () => {
    today = {
      dueToday: jest.fn().mockResolvedValue([]),
      timeline: jest.fn().mockResolvedValue([]),
      currentBlock: jest.fn().mockReturnValue(null),
    };
    const module = await Test.createTestingModule({
      controllers: [TodayController],
      providers: [{ provide: TodayService, useValue: today }],
    }).compile();
    controller = module.get(TodayController);
  });

  it('composes dueToday + timeline + currentBlock into TodayResponseDto, with suggestion still null', async () => {
    const dueTodayRows = [{ itemId: '1', title: 'Rapor', dueAt: null, status: 'open' }];
    const timelineRows = [
      {
        itemId: '2',
        title: 'Toplantı',
        kind: 'event',
        scheduledAt: '2026-01-05T10:00:00.000Z',
        durationMin: 30,
      },
    ];
    const block = {
      itemId: '2',
      title: 'Toplantı',
      scheduledAt: '2026-01-05T10:00:00.000Z',
      durationMin: 30,
    };
    today.dueToday.mockResolvedValueOnce(dueTodayRows);
    today.timeline.mockResolvedValueOnce(timelineRows);
    today.currentBlock.mockReturnValueOnce(block);

    const result = await controller.get({ userId: '1', email: 'a@b.com', role: 'user' });

    expect(today.dueToday).toHaveBeenCalledWith('1');
    expect(today.timeline).toHaveBeenCalledWith('1');
    expect(today.currentBlock).toHaveBeenCalledWith(timelineRows);
    expect(result.dueToday).toEqual(dueTodayRows);
    expect(result.timeline).toEqual(timelineRows);
    expect(result.currentBlock).toEqual(block);
    expect(result.suggestion).toBeNull();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
