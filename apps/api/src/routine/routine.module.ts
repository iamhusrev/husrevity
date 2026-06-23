import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutineSegment } from './routine-segment.entity';
import { RoutineActivity } from './routine-activity.entity';
import { RoutineService } from './routine.service';
import { RoutineController } from './routine.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RoutineSegment, RoutineActivity])],
  providers: [RoutineService],
  controllers: [RoutineController],
})
export class RoutineModule {}
