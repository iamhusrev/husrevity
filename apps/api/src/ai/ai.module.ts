import { Module } from '@nestjs/common';
import { AiSuggestionService } from './ai-suggestion.service';
import { AiSuggestionController } from './ai-suggestion.controller';
import { DictateService } from './dictate.service';
import { DictateController } from './dictate.controller';
import { GeminiConfig } from './gemini.config';
import { ProjectModule } from '../project/project.module';
import { NoteModule } from '../note/note.module';
import { ReminderModule } from '../reminder/reminder.module';
import { TaskModule } from '../task/task.module';

@Module({
  imports: [ProjectModule, NoteModule, ReminderModule, TaskModule],
  providers: [GeminiConfig, AiSuggestionService, DictateService],
  controllers: [AiSuggestionController, DictateController],
})
export class AiModule {}
