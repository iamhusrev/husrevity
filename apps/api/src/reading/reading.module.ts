import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReadingTrack } from './reading-track.entity';
import { ReadingLog } from './reading-log.entity';
import { ReadingService } from './reading.service';
import { ReadingController } from './reading.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReadingTrack, ReadingLog])],
  providers: [ReadingService],
  controllers: [ReadingController],
})
export class ReadingModule {}
