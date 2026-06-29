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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReadingService } from './reading.service';
import {
  LogRequestDto,
  LogResponseDto,
  ReadingReorderRequestDto,
  TrackRequestDto,
  TrackResponseDto,
} from './dto/reading-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('reading')
@ApiBearerAuth()
@Controller('reading-tracks')
export class ReadingController {
  constructor(private readonly reading: ReadingService) {}

  @Get()
  listTracks(@CurrentUser() u: AuthenticatedUser): Promise<TrackResponseDto[]> {
    return this.reading.listTracks(u.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTrack(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: TrackRequestDto,
  ): Promise<TrackResponseDto> {
    return this.reading.createTrack(u.userId, body);
  }

  @Get('logs')
  @ApiQuery({ name: 'from', example: '2026-06-01' })
  @ApiQuery({ name: 'to', example: '2026-06-30' })
  listLogs(
    @CurrentUser() u: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<LogResponseDto[]> {
    return this.reading.listLogs(u.userId, from, to);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderTracks(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReadingReorderRequestDto,
  ): Promise<void> {
    return this.reading.reorderTracks(u.userId, body.items);
  }

  @Put(':id')
  updateTrack(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TrackRequestDto,
  ): Promise<TrackResponseDto> {
    return this.reading.updateTrack(u.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTrack(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.reading.deleteTrack(u.userId, id);
  }

  @Put(':id/logs/:date')
  upsertLog(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('date') date: string,
    @Body() body: LogRequestDto,
  ): Promise<LogResponseDto> {
    return this.reading.upsertLog(u.userId, id, date, body);
  }
}
