import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { AiSuggestionService } from './ai-suggestion.service';
import {
  SuggestionItemDto,
  SuggestionsRequestDto,
} from './dto/suggestion-dtos';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiSuggestionController {
  constructor(private readonly svc: AiSuggestionService) {}

  /**
   * Dashboard "what should I do?" — pulls notes/reminders/plans/projects/tasks
   * for the current user, RAG-lite into Gemini, returns 1 or 3 suggestions.
   *
   * Tighter throttle than the global default because each call is one LLM call.
   * In-process 5-minute cache keyed by (owner, mode, count, content-hash).
   */
  @Post('suggestions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  suggest(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: SuggestionsRequestDto,
  ): Promise<SuggestionItemDto[]> {
    return this.svc.suggest(u.userId, body);
  }
}
