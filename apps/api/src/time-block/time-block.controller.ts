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
import { TimeBlockService } from './time-block.service';
import {
  TimeBlockRequestDto,
  TimeBlockResponseDto,
} from './dto/time-block-dtos';
import { ApiException } from '../common/api.exception';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';

@ApiTags('time-blocks')
@ApiBearerAuth()
@Controller('time-blocks')
export class TimeBlockController {
  constructor(private readonly blocks: TimeBlockService) {}

  /**
   * `GET /time-blocks?date=YYYY-MM-DD` → single-day list (Evkat default view).
   * `GET /time-blocks?from=ISO&to=ISO` → range list (week view / overlay).
   * Exactly one of those modes must be specified.
   */
  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TimeBlockResponseDto[]> {
    if (date) return this.blocks.listForDate(u.userId, date);
    if (from && to) return this.blocks.listForRange(u.userId, from, to);
    throw ApiException.badRequest(
      'Provide either ?date=YYYY-MM-DD or ?from=ISO&to=ISO',
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: TimeBlockRequestDto,
  ): Promise<TimeBlockResponseDto> {
    return this.blocks.create(u.userId, body);
  }

  @Put(':id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TimeBlockRequestDto,
  ): Promise<TimeBlockResponseDto> {
    return this.blocks.update(u.userId, id, body);
  }

  @Patch(':id/complete')
  toggleComplete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TimeBlockResponseDto> {
    return this.blocks.toggleComplete(u.userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.blocks.delete(u.userId, id);
  }
}
