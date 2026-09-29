import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Device } from './device.entity';
import { DeviceResponseDto, RegisterDeviceRequestDto } from './dto/device-dtos';

@Injectable()
export class DeviceService {
  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  /** Upserts by (ownerId, pushToken) — a device re-registering (app reinstall, token refresh) just bumps lastSeenAt/platform instead of creating a duplicate row. */
  async register(ownerId: string, req: RegisterDeviceRequestDto): Promise<DeviceResponseDto> {
    const existing = await this.devices.findOne({
      where: { ownerId, pushToken: req.pushToken },
    });
    const now = new Date();
    let saved: Device;
    if (existing) {
      existing.platform = req.platform;
      existing.lastSeenAt = now;
      saved = await this.devices.save(existing);
    } else {
      const created = this.devices.create({
        ownerId,
        platform: req.platform,
        pushToken: req.pushToken,
        lastSeenAt: now,
      });
      saved = await this.devices.save(created);
    }
    // A push token identifies one physical app install, so only the user
    // currently logged in on it may own it. Drop stale registrations of the
    // same token under other owners — otherwise a previous user keeps
    // receiving their notifications on a phone someone else now uses.
    await this.devices.softDelete({ pushToken: req.pushToken, ownerId: Not(ownerId) });
    return DeviceResponseDto.from(saved);
  }

  /** Called on logout so the signed-out user's notifications stop reaching this device. */
  async unregister(ownerId: string, pushToken: string): Promise<void> {
    await this.devices.softDelete({ ownerId, pushToken });
  }

  /** Find active iOS and Android mobile devices for a given owner. */
  async findActiveForOwner(ownerId: string): Promise<Device[]> {
    return this.devices.find({
      where: [
        { ownerId, platform: 'ios' },
        { ownerId, platform: 'android' },
      ],
      order: { lastSeenAt: 'DESC' },
    });
  }
}
