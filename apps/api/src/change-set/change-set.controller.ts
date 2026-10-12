import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChangeSetService } from './change-set.service';
import {
  ChangeSetDetailResponseDto,
  ChangeSetListQueryDto,
  ChangeSetSummaryResponseDto,
  UndoResponseDto,
} from './dto/change-set-dtos';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

@ApiTags('change-sets')
@ApiBearerAuth()
@Controller('change-sets')
export class ChangeSetController {
  constructor(private readonly changeSetService: ChangeSetService) {}

  @Get()
  @ApiOperation({ summary: 'List change sets for the authenticated user (newest first)' })
  @ApiResponse({ status: 200, type: [ChangeSetSummaryResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ChangeSetListQueryDto,
  ): Promise<ChangeSetSummaryResponseDto[]> {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const result = await this.changeSetService.list(user.userId, {
      limit,
      before: query.before,
    });
    return result.items;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a change set with its recorded mutation entries' })
  @ApiResponse({ status: 200, type: ChangeSetDetailResponseDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<ChangeSetDetailResponseDto> {
    return this.changeSetService.get(user.userId, id);
  }

  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo all entries in a change set in reverse order' })
  @ApiResponse({ status: 200, type: UndoResponseDto })
  async undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<UndoResponseDto> {
    return this.changeSetService.undo(user.userId, id);
  }
}
