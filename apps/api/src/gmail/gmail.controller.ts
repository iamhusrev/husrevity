import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GmailService } from './gmail.service';
import {
  AccountResponseDto,
  MessageDetailDto,
  MessageSummaryDto,
  PageDto,
  SendRequestDto,
  SendResponseDto,
} from './dto/gmail-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('gmail')
@ApiBearerAuth()
@Controller('gmail')
export class GmailController {
  constructor(private readonly gmail: GmailService) {}

  @Get('accounts')
  accounts(@CurrentUser() u: AuthenticatedUser): Promise<AccountResponseDto[]> {
    return this.gmail.listAccounts(u.userId);
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.gmail.deleteAccount(u.userId, id);
  }

  @Get('accounts/:id/messages')
  messages(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page = '0',
    @Query('size') size = '30',
  ): Promise<PageDto<MessageSummaryDto>> {
    return this.gmail.listMessages(u.userId, id, Number(page), Number(size));
  }

  @Get('accounts/:id/messages/:mid')
  message(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
  ): Promise<MessageDetailDto> {
    return this.gmail.getMessageDetail(u.userId, id, mid);
  }

  @Post('accounts/:id/send')
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SendRequestDto,
  ): Promise<SendResponseDto> {
    return this.gmail.send(u.userId, id, body);
  }

  @Post('accounts/:id/sync')
  async sync(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ synced: number }> {
    const synced = await this.gmail.sync(u.userId, id);
    return { synced };
  }

  @Post('accounts/:id/messages/:mid/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
  ): Promise<void> {
    return this.gmail.setUnread(u.userId, id, mid, false);
  }

  @Post('accounts/:id/messages/:mid/unread')
  @HttpCode(HttpStatus.OK)
  markUnread(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
  ): Promise<void> {
    return this.gmail.setUnread(u.userId, id, mid, true);
  }

  @Post('accounts/:id/messages/:mid/star')
  @HttpCode(HttpStatus.OK)
  star(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
  ): Promise<void> {
    return this.gmail.setStarred(u.userId, id, mid, true);
  }

  @Post('accounts/:id/messages/:mid/unstar')
  @HttpCode(HttpStatus.OK)
  unstar(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
  ): Promise<void> {
    return this.gmail.setStarred(u.userId, id, mid, false);
  }
}
