import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalService } from './goal.service';
import { GoalController } from './goal.controller';
import { IdempotencyKey } from '../common/idempotency-key.entity';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, IdempotencyKey])],
  providers: [GoalService, IdempotencyInterceptor],
  controllers: [GoalController],
  exports: [GoalService, TypeOrmModule],
})
export class GoalModule {}
