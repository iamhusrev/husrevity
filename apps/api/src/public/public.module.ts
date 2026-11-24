import { Module } from '@nestjs/common';
import { PublicLegalController } from './public-legal.controller';
import { PublicLegalService } from './public-legal.service';

@Module({
  controllers: [PublicLegalController],
  providers: [PublicLegalService],
})
export class PublicModule {}
