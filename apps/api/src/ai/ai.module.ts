import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage } from './ai-message.entity';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { AiSuggestionService } from './ai-suggestion.service';
import { AiSuggestionController } from './ai-suggestion.controller';
import { GeminiConfig } from './gemini.config';
import { ProjectModule } from '../project/project.module';
import { PlanModule } from '../plan/plan.module';
import { NoteModule } from '../note/note.module';
import { ReminderModule } from '../reminder/reminder.module';
import { TaskModule } from '../task/task.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiConversation, AiMessage]),
    ProjectModule,
    PlanModule,
    NoteModule,
    ReminderModule,
    TaskModule,
  ],
  providers: [GeminiConfig, AiChatService, AiSuggestionService],
  controllers: [AiChatController, AiSuggestionController],
})
export class AiModule {}
