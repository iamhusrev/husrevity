import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalService } from './goal.service';
import { GoalController } from './goal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Goal])],
  providers: [GoalService],
  controllers: [GoalController],
  exports: [GoalService, TypeOrmModule],
})
export class GoalModule {}
