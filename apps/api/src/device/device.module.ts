import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { ExpoPushNotifier } from './expo-push.notifier';

@Module({
  imports: [TypeOrmModule.forFeature([Device])],
  providers: [DeviceService, ExpoPushNotifier],
  controllers: [DeviceController],
  exports: [DeviceService, ExpoPushNotifier],
})
export class DeviceModule {}
