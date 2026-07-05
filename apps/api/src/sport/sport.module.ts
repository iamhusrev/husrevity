import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SportProfile } from './entities/sport-profile.entity';
import { SportProgram } from './entities/sport-program.entity';
import { SportSession } from './entities/sport-session.entity';
import { SportLog } from './entities/sport-log.entity';
import { SportProfileService } from './sport-profile.service';
import { SportProgramService } from './sport-program.service';
import { SportSessionService } from './sport-session.service';
import { SportLogService } from './sport-log.service';
import { SportAiService } from './sport-ai.service';
import { GeminiConfig } from '../ai/gemini.config';
import { SportController } from './sport.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SportProfile, SportProgram, SportSession, SportLog]),
  ],
  controllers: [SportController],
  providers: [
    GeminiConfig,
    SportProfileService,
    SportProgramService,
    SportSessionService,
    SportLogService,
    SportAiService,
  ],
  exports: [
    SportProfileService,
    SportProgramService,
    SportSessionService,
    SportLogService,
    SportAiService,
  ],
})
export class SportModule {}
