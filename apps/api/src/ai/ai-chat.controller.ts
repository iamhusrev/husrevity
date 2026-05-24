import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiChatService } from './ai-chat.service';
import {
  ConversationDto,
  CreateConversationDto,
  MessageDto,
  PageDto,
  SendMessageDto,
  UpdateConversationDto,
} from './dto/ai-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiChatController {
  constructor(private readonly ai: AiChatService) {}

  @Get('conversations')
  list(@CurrentUser() u: AuthenticatedUser): Promise<ConversationDto[]> {
    return this.ai.listConversations(u.userId);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: CreateConversationDto,
  ): Promise<ConversationDto> {
    return this.ai.createConversation(u.userId, body.title);
  }

  @Patch('conversations/:id')
  rename(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateConversationDto,
  ): Promise<ConversationDto> {
    return this.ai.renameConversation(u.userId, id, body.title);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.ai.deleteConversation(u.userId, id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page = '0',
    @Query('size') size = '50',
  ): Promise<PageDto<MessageDto>> {
    return this.ai.listMessages(u.userId, id, Number(page), Number(size));
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ): Promise<MessageDto> {
    return this.ai.sendMessage(u.userId, id, body.content);
  }
}
