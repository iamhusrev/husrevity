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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';
import {
  ReminderListRequestDto,
  ReminderListResponseDto,
  ReminderRequestDto,
  ReminderResponseDto,
  ReorderRequestDto,
} from './dto/reminder-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller()
export class ReminderController {
  constructor(private readonly reminders: ReminderService) {}

  // ─── Lists ──────────────────────────────────────────────────────────────────

  @Get('reminder-lists')
  listLists(@CurrentUser() u: AuthenticatedUser): Promise<ReminderListResponseDto[]> {
    return this.reminders.listReminderLists(u.userId);
  }

  @Post('reminder-lists')
  @HttpCode(HttpStatus.CREATED)
  createList(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReminderListRequestDto,
  ): Promise<ReminderListResponseDto> {
    return this.reminders.createList(u.userId, body);
  }

  @Put('reminder-lists/:id')
  updateList(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReminderListRequestDto,
  ): Promise<ReminderListResponseDto> {
    return this.reminders.updateList(u.userId, id, body);
  }

  @Delete('reminder-lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteList(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.reminders.deleteList(u.userId, id);
  }

  @Patch('reminder-lists/:id/restore')
  restoreList(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReminderListResponseDto> {
    return this.reminders.restoreList(u.userId, id);
  }

  @Patch('reminder-lists/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderLists(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.reminders.reorderLists(u.userId, body.items);
  }

  @Get('reminder-lists/:id/reminders')
  byList(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
  ): Promise<ReminderResponseDto[]> {
    return this.reminders.listByList(u.userId, listId);
  }

  // ─── Reminders ──────────────────────────────────────────────────────────────

  @Get('reminders')
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('listId') listId?: string,
    @Query('completed') completed?: string,
  ): Promise<ReminderResponseDto[]> {
    const c = completed === undefined ? undefined : completed === 'true';
    return this.reminders.listReminders(u.userId, listId, c);
  }

  @Post('reminders')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReminderRequestDto,
  ): Promise<ReminderResponseDto> {
    return this.reminders.createReminder(u.userId, body);
  }

  @Put('reminders/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReminderRequestDto,
  ): Promise<ReminderResponseDto> {
    return this.reminders.updateReminder(u.userId, id, body);
  }

  @Post('reminders/:id/toggle')
  @HttpCode(HttpStatus.OK)
  toggle(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReminderResponseDto> {
    return this.reminders.toggleReminder(u.userId, id);
  }

  @Delete('reminders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.reminders.deleteReminder(u.userId, id);
  }

  @Patch('reminders/:id/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReminderResponseDto> {
    return this.reminders.restoreReminder(u.userId, id);
  }

  @Patch('reminders/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@CurrentUser() u: AuthenticatedUser, @Body() body: ReorderRequestDto): Promise<void> {
    return this.reminders.reorderReminders(u.userId, body.items);
  }
}
