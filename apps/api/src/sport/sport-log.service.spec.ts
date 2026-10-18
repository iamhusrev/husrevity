import { SportLogService } from './sport-log.service';

describe('SportLogService.logWorkout', () => {
  const ownerId = '1';
  let logs: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let service: SportLogService;

  const baseReq = {
    executedDate: '2026-10-12',
    actualDuration: 30,
    completed: true,
    intensity: 6,
  };

  beforeEach(() => {
    logs = {
      findOne: jest.fn(),
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn((v) => Promise.resolve({ id: v.id ?? 'new', createdAt: new Date(), ...v })),
    };
    service = new SportLogService(logs as never);
  });

  // Two free workouts on the same day are two distinct rows. The old lookup
  // (owner, date, sessionId IS NULL) made the second one overwrite the first.
  it('inserts a new row for every free workout (no sessionId), even on the same day', async () => {
    logs.findOne.mockResolvedValue({
      id: 'existing',
      ownerId,
      sessionId: null,
      executedDate: baseReq.executedDate,
      actualDuration: 20,
      completed: true,
      intensity: 3,
      notes: 'morning run',
    });

    const result = await service.logWorkout(ownerId, { ...baseReq, notes: 'evening swim' });

    expect(logs.findOne).not.toHaveBeenCalled();
    expect(logs.create).toHaveBeenCalledWith({
      ownerId,
      sessionId: null,
      executedDate: baseReq.executedDate,
    });
    const saved = logs.save.mock.calls[0][0];
    expect(saved.id).toBeUndefined();
    expect(saved.notes).toBe('evening swim');
    expect(result.id).toBe('new');
  });

  it('updates the existing row for the same planned session on the same day', async () => {
    const existing = {
      id: '7',
      ownerId,
      sessionId: 's1',
      executedDate: baseReq.executedDate,
      actualDuration: 20,
      completed: false,
      intensity: 3,
      notes: null,
      caloriesBurned: null,
    };
    logs.findOne.mockResolvedValueOnce(existing);

    const result = await service.logWorkout(ownerId, {
      ...baseReq,
      sessionId: 's1',
      actualDuration: 45,
    });

    expect(logs.findOne).toHaveBeenCalledWith({
      where: { ownerId, executedDate: baseReq.executedDate, sessionId: 's1' },
    });
    expect(logs.create).not.toHaveBeenCalled();
    expect(logs.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7', sessionId: 's1', actualDuration: 45, completed: true }),
    );
    expect(result.id).toBe('7');
  });

  it('creates the row for a planned session that has no log on that day yet', async () => {
    logs.findOne.mockResolvedValueOnce(null);

    await service.logWorkout(ownerId, { ...baseReq, sessionId: 's1' });

    expect(logs.create).toHaveBeenCalledWith({
      ownerId,
      sessionId: 's1',
      executedDate: baseReq.executedDate,
    });
    expect(logs.save).toHaveBeenCalledTimes(1);
  });
});
