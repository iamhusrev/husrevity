import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SportProfile } from './entities/sport-profile.entity';
import { SportProgram } from './entities/sport-program.entity';
import { SportSession } from './entities/sport-session.entity';
import { SportLog } from './entities/sport-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SportProfile, SportProgram, SportSession, SportLog]),
  ],
})
export class SportModule {}
