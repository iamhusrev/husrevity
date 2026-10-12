import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeBlock } from './time-block.entity';
import { TimeBlockService } from './time-block.service';
import { TimeBlockController } from './time-block.controller';
import { NotificationModule } from '../notification/notification.module';
import { ItemMirrorModule } from '../item-mirror/item-mirror.module';

@Module({
  imports: [TypeOrmModule.forFeature([TimeBlock]), NotificationModule, ItemMirrorModule],
  providers: [TimeBlockService],
  controllers: [TimeBlockController],
  exports: [TimeBlockService],
})
export class TimeBlockModule {}
