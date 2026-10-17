import { SportLogService } from './sport-log.service';
import { ApiException } from '../common/api.exception';

describe('SportLogService.getLog', () => {
  const ownerId = '1';
  let logs: { findOne: jest.Mock };
  let service: SportLogService;

  beforeEach(() => {
    logs = { findOne: jest.fn() };
    service = new SportLogService(logs as never);
  });

  it('returns the owner-scoped log', async () => {
    logs.findOne.mockResolvedValueOnce({
      id: '12',
      ownerId,
      logDate: '2026-01-02',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.getLog(ownerId, '12');

    expect(logs.findOne).toHaveBeenCalledWith({ where: { id: '12', ownerId } });
    expect(result).toMatchObject({ id: '12' });
  });

  it('throws notFound for a missing or foreign log', async () => {
    logs.findOne.mockResolvedValueOnce(null);

    await expect(service.getLog(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
  });
});
