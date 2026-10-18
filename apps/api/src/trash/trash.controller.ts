import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { TrashService } from './trash.service';
import { TrashListQueryDto, TrashListResponseDto } from './dto/trash-dtos';

@ApiTags('trash')
@ApiBearerAuth()
@Controller('trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  @ApiOperation({
    summary: 'Recently deleted entries the caller can restore',
    description:
      'Soft-deleted tasks, projects, reminders, reminder lists, calendar events and goals, newest ' +
      'deletion first. Each entry carries the PATCH route (restorePath) and MCP tool (restoreTool) ' +
      'that restores it. Only titles are exposed, never bodies or notes. Tasks of a deleted project ' +
      'are not listed separately: restoring the project brings them back.',
  })
  @ApiOkResponse({ type: TrashListResponseDto })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: TrashListQueryDto,
  ): Promise<TrashListResponseDto> {
    return this.trash.list(u.userId, {
      kinds: query.kind,
      since: query.since,
      limit: query.limit,
      cursor: query.cursor,
    });
  }
}
