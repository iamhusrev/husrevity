import { Module } from '@nestjs/common';
import { AiSuggestionService } from './ai-suggestion.service';
import { AiSuggestionController } from './ai-suggestion.controller';
import { GeminiConfig } from './gemini.config';
import { ProjectModule } from '../project/project.module';
import { PlanModule } from '../plan/plan.module';
import { NoteModule } from '../note/note.module';
import { ReminderModule } from '../reminder/reminder.module';
import { TaskModule } from '../task/task.module';

@Module({
  imports: [ProjectModule, PlanModule, NoteModule, ReminderModule, TaskModule],
  providers: [GeminiConfig, AiSuggestionService],
  controllers: [AiSuggestionController],
})
export class AiModule {}
