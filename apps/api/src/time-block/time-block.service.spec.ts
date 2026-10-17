import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeBlockService } from './time-block.service';
import { ApiException } from '../common/api.exception';
import { TimeBlock } from './time-block.entity';
import { NotificationService } from '../notification/notification.service';
import { ItemMirrorService } from '../item-mirror/item-mirror.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softRemove: jest.Mock;
};

describe('TimeBlockService', () => {
  const ownerId = '1';

  let service: TimeBlockService;
  let blocks: MockRepo;
  let notifications: { cancelForSource: jest.Mock; enqueue: jest.Mock };
  let mirror: {
    upsertFromTimeBlock: jest.Mock;
    softDeleteMirror: jest.Mock;
  };

  const sampleBlock = {
    id: '40',
    ownerId,
    title: 'Deep Work',
    notes: 'Focus on coding',
    startAt: new Date('2026-08-01T09:00:00Z'),
    endAt: new Date('2026-08-01T11:00:00Z'),
    category: 'focus',
    colorToken: 'husrev-amber',
    notifyMinutesBefore: 10,
    completedAt: null,
    createdAt: new Date('2026-08-01T08:00:00Z'),
    updatedAt: new Date('2026-08-01T08:00:00Z'),
    deletedAt: null,
  } as unknown as TimeBlock;

  beforeEach(async () => {
    blocks = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };
    notifications = { cancelForSource: jest.fn(), enqueue: jest.fn() };
    mirror = {
      upsertFromTimeBlock: jest.fn(),
      softDeleteMirror: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TimeBlockService,
        { provide: getRepositoryToken(TimeBlock), useValue: blocks },
        { provide: NotificationService, useValue: notifications },
        { provide: ItemMirrorService, useValue: mirror },
      ],
    }).compile();

    service = module.get(TimeBlockService);
  });

  describe('get', () => {
    it('returns the owner-scoped time block as a DTO', async () => {
      blocks.findOne.mockResolvedValueOnce(sampleBlock);

      const result = await service.get(ownerId, '40');

      expect(blocks.findOne).toHaveBeenCalledWith({ where: { id: '40', ownerId } });
      expect(result).toMatchObject({ id: '40', title: 'Deep Work' });
    });

    it('throws notFound for a missing or foreign time block', async () => {
      blocks.findOne.mockResolvedValueOnce(null);

      await expect(service.get(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('mirror hooks', () => {
    it('create mirrors saved time block to ItemMirrorService', async () => {
      blocks.create.mockReturnValue(sampleBlock);
      blocks.save.mockResolvedValue(sampleBlock);

      const res = await service.create(ownerId, {
        title: 'Deep Work',
        startAt: '2026-08-01T09:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('40');
      expect(mirror.upsertFromTimeBlock).toHaveBeenCalledWith(sampleBlock);
    });

    it('update mirrors updated time block to ItemMirrorService', async () => {
      blocks.findOne.mockResolvedValue(sampleBlock);
      blocks.save.mockResolvedValue(sampleBlock);

      const res = await service.update(ownerId, '40', {
        title: 'Updated Work',
        startAt: '2026-08-01T09:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('40');
      expect(mirror.upsertFromTimeBlock).toHaveBeenCalledWith(sampleBlock);
    });

    it('toggleComplete mirrors updated time block to ItemMirrorService', async () => {
      blocks.findOne.mockResolvedValue({ ...sampleBlock });
      const completed = { ...sampleBlock, completedAt: new Date() };
      blocks.save.mockResolvedValue(completed);

      const res = await service.toggleComplete(ownerId, '40');

      expect(res.id).toBe('40');
      expect(mirror.upsertFromTimeBlock).toHaveBeenCalledWith(completed);
    });

    it('delete mirrors soft delete to ItemMirrorService', async () => {
      blocks.findOne.mockResolvedValue(sampleBlock);
      blocks.softRemove.mockResolvedValue(sampleBlock);

      await service.delete(ownerId, '40');

      expect(mirror.softDeleteMirror).toHaveBeenCalledWith('time_block', '40', ownerId);
    });

    it('continues successfully if mirror throws an error during create', async () => {
      blocks.create.mockReturnValue(sampleBlock);
      blocks.save.mockResolvedValue(sampleBlock);
      mirror.upsertFromTimeBlock.mockRejectedValue(new Error('mirror fail'));

      const res = await service.create(ownerId, {
        title: 'Deep Work',
        startAt: '2026-08-01T09:00:00Z',
        endAt: '2026-08-01T11:00:00Z',
      });

      expect(res.id).toBe('40');
    });
  });
});
