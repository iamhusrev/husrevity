import { IsIn, IsNotEmpty, MaxLength } from 'class-validator';
import { Device, DevicePlatform } from '../device.entity';

export const DEVICE_PLATFORMS: DevicePlatform[] = ['ios', 'android', 'web'];

export class RegisterDeviceRequestDto {
  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;

  @IsNotEmpty()
  @MaxLength(512)
  pushToken!: string;
}

export class UnregisterDeviceRequestDto {
  @IsNotEmpty()
  @MaxLength(512)
  pushToken!: string;
}

export class DeviceResponseDto {
  id!: string;
  platform!: DevicePlatform;
  pushToken!: string;
  lastSeenAt!: string;

  static from(d: Device): DeviceResponseDto {
    return {
      id: d.id,
      platform: d.platform,
      pushToken: d.pushToken,
      lastSeenAt: d.lastSeenAt.toISOString(),
    };
  }
}
