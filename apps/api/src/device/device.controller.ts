import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import {
  DeviceResponseDto,
  RegisterDeviceRequestDto,
  UnregisterDeviceRequestDto,
} from './dto/device-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: RegisterDeviceRequestDto,
  ): Promise<DeviceResponseDto> {
    return this.devices.register(u.userId, body);
  }

  @Post('unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: UnregisterDeviceRequestDto,
  ): Promise<void> {
    await this.devices.unregister(u.userId, body.pushToken);
  }
}
