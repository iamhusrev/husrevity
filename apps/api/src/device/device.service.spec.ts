import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceService } from './device.service';
import { Device } from './device.entity';

type MockRepo = { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; softDelete: jest.Mock };

describe('DeviceService', () => {
  const ownerId = '1';
  let service: DeviceService;
  let devices: MockRepo;

  beforeEach(async () => {
    devices = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: '1', lastSeenAt: new Date(), ...v })),
      softDelete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const module = await Test.createTestingModule({
      providers: [DeviceService, { provide: getRepositoryToken(Device), useValue: devices }],
    }).compile();
    service = module.get(DeviceService);
  });

  describe('register', () => {
    it('creates a new device row when the push token is unseen', async () => {
      devices.findOne.mockResolvedValueOnce(null);

      const result = await service.register(ownerId, { platform: 'ios', pushToken: 'tok-1' });

      expect(devices.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId, platform: 'ios', pushToken: 'tok-1' }),
      );
      expect(result.pushToken).toBe('tok-1');
    });

    it('upserts (bumps platform/lastSeenAt) instead of duplicating when the token already exists', async () => {
      const existing = {
        id: '5',
        ownerId,
        platform: 'android',
        pushToken: 'tok-1',
        lastSeenAt: new Date(0),
      } as Device;
      devices.findOne.mockResolvedValueOnce(existing);

      await service.register(ownerId, { platform: 'ios', pushToken: 'tok-1' });

      expect(devices.create).not.toHaveBeenCalled();
      expect(devices.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '5', platform: 'ios' }),
      );
    });

    it('drops registrations of the same push token that belong to OTHER owners', async () => {
      devices.findOne.mockResolvedValueOnce(null);

      await service.register(ownerId, { platform: 'ios', pushToken: 'tok-shared' });

      expect(devices.softDelete).toHaveBeenCalledTimes(1);
      const criteria = devices.softDelete.mock.calls[0][0];
      expect(criteria.pushToken).toBe('tok-shared');
      // Not(ownerId): must exclude the registering owner, never target them
      expect(criteria.ownerId.type).toBe('not');
      expect(criteria.ownerId.value).toBe(ownerId);
    });
  });

  describe('unregister', () => {
    it("soft-deletes only this owner's row for the given token", async () => {
      await service.unregister(ownerId, 'tok-1');

      expect(devices.softDelete).toHaveBeenCalledWith({ ownerId, pushToken: 'tok-1' });
    });
  });
});
