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
import { SportProfileService } from './sport-profile.service';
import { SportProgramService } from './sport-program.service';
import { SportSessionService } from './sport-session.service';
import { SportLogService } from './sport-log.service';
import { SportAiService } from './sport-ai.service';
import { ApiException } from '../common/api.exception';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { ProfileRequestDto, ProfileResponseDto } from './dto/sport-profile.dto';
import {
  ProgramRequestDto,
  ProgramResponseDto,
  ProgramUpdateRequestDto,
} from './dto/sport-program.dto';
import {
  ReorderSessionsDto,
  SessionRequestDto,
  SessionResponseDto,
  SessionUpdateRequestDto,
} from './dto/sport-session.dto';
import { LogRequestDto, LogResponseDto, LogUpdateRequestDto } from './dto/sport-log.dto';
import { GenerateAiProgramDto, SportStatsDto } from './dto/sport-shared.dto';

@ApiTags('sport')
@ApiBearerAuth()
@Controller('sport')
export class SportController {
  constructor(
    private readonly profileService: SportProfileService,
    private readonly programService: SportProgramService,
    private readonly sessionService: SportSessionService,
    private readonly logService: SportLogService,
    private readonly aiService: SportAiService,
  ) {}

  // ---------------------------------------------------------------- PROFILE

  @Get('profile')
  getProfile(@CurrentUser() u: AuthenticatedUser): Promise<ProfileResponseDto> {
    return this.profileService.getOrCreate(u.userId);
  }

  @Put('profile')
  updateProfile(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ProfileRequestDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.update(u.userId, body);
  }

  // --------------------------------------------------------------- PROGRAMS

  @Get('programs')
  listPrograms(@CurrentUser() u: AuthenticatedUser): Promise<ProgramResponseDto[]> {
    return this.programService.listPrograms(u.userId);
  }

  @Post('programs')
  @HttpCode(HttpStatus.CREATED)
  createProgram(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ProgramRequestDto,
  ): Promise<ProgramResponseDto> {
    return this.programService.createProgram(u.userId, body);
  }

  @Get('programs/:id')
  getProgram(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProgramResponseDto> {
    return this.programService.getProgram(u.userId, id);
  }

  @Put('programs/:id')
  updateProgram(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ProgramUpdateRequestDto,
  ): Promise<ProgramResponseDto> {
    return this.programService.updateProgram(u.userId, id, body);
  }

  @Delete('programs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProgram(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.programService.deleteProgram(u.userId, id);
  }

  @Post('programs/:id/activate')
  activateProgram(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ): Promise<ProgramResponseDto> {
    return this.programService.activateProgram(u.userId, id, body.isActive);
  }

  // ------------------------------------------------------------- AI PROGRAM

  @Post('programs/generate-ai')
  @HttpCode(HttpStatus.CREATED)
  async generateAiProgram(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: GenerateAiProgramDto,
  ): Promise<ProgramResponseDto> {
    const profile = await this.profileService.getOrCreate(u.userId);
    return this.aiService.generateProgram(u.userId, profile.id, body);
  }

  // --------------------------------------------------------------- SESSIONS

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: SessionRequestDto,
  ): Promise<SessionResponseDto> {
    if (!body.programId) throw ApiException.badRequest('"programId" is required');
    return this.sessionService.createSession(u.userId, body.programId, body);
  }

  @Put('sessions/:id')
  updateSession(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SessionUpdateRequestDto,
  ): Promise<SessionResponseDto> {
    return this.sessionService.updateSession(u.userId, id, body);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSession(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.sessionService.deleteSession(u.userId, id);
  }

  @Patch('sessions/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderSessions(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReorderSessionsDto,
  ): Promise<void> {
    if (!body.items.length) return;
    const first = await this.sessionService.requireSession(u.userId, body.items[0].id);
    if (!first.programId) throw ApiException.notFound('Sport session not found');
    return this.sessionService.reorderSessions(u.userId, first.programId, body.items);
  }

  // ------------------------------------------------------------------ LOGS

  @Post('logs')
  @HttpCode(HttpStatus.CREATED)
  logWorkout(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: LogRequestDto,
  ): Promise<LogResponseDto> {
    return this.logService.logWorkout(u.userId, body);
  }

  @Get('logs')
  @ApiQuery({ name: 'from', example: '2026-06-01' })
  @ApiQuery({ name: 'to', example: '2026-06-30' })
  getLogsForPeriod(
    @CurrentUser() u: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<LogResponseDto[]> {
    return this.logService.getLogsForPeriod(u.userId, from, to);
  }

  @Put('logs/:id')
  updateLog(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LogUpdateRequestDto,
  ): Promise<LogResponseDto> {
    return this.logService.updateLog(u.userId, id, body);
  }

  @Delete('logs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLog(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.logService.deleteLog(u.userId, id);
  }

  // ----------------------------------------------------------------- STATS

  @Get('stats')
  @ApiQuery({ name: 'from', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-30' })
  getStats(
    @CurrentUser() u: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<SportStatsDto> {
    return this.logService.getStats(u.userId, from, to);
  }
}
