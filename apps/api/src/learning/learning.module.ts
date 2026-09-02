import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../notification/notification.module';
import { LearningController } from './learning.controller';
import { LearningItem } from './learning-item.entity';
import { LearningService } from './learning.service';
import { LearningTopic } from './learning-topic.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LearningTopic, LearningItem]), NotificationModule],
  providers: [LearningService],
  controllers: [LearningController],
})
export class LearningModule {}
