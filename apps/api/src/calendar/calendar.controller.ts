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
import { CalendarService } from './calendar.service';
import { EventRequestDto, EventResponseDto } from './dto/calendar-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar/events')
export class CalendarController {
  constructor(private readonly events: CalendarService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<EventResponseDto[]> {
    return this.events.list(u.userId, from, to);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<EventResponseDto> {
    return this.events.get(u.userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: EventRequestDto,
  ): Promise<EventResponseDto> {
    return this.events.create(u.userId, body);
  }

  @Put(':id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: EventRequestDto,
  ): Promise<EventResponseDto> {
    return this.events.update(u.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.events.delete(u.userId, id);
  }

  @Patch(':id/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventResponseDto> {
    return this.events.restore(u.userId, id);
  }
}
