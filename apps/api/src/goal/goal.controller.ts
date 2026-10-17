import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { parseIfMatch } from '../common/if-match';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GoalService } from './goal.service';
import {
  GoalListQueryDto,
  GoalRequestDto,
  GoalResponseDto,
  GoalUpdateRequestDto,
} from './dto/goal-dtos';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';
import { ApiException } from '../common/api.exception';
import { isValidNumericId } from '../common/numeric-id.pipe';

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals')
export class GoalController {
  constructor(private readonly goals: GoalService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: GoalListQueryDto,
  ): Promise<GoalResponseDto[]> {
    return this.goals.list(u.userId, query);
  }

  @Get(':id')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be a numeric ID (1-19 digits)');
    }
    return this.goals.get(u.userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: GoalRequestDto,
  ): Promise<GoalResponseDto> {
    return this.goals.create(u.userId, body);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: GoalUpdateRequestDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be a numeric ID (1-19 digits)');
    }
    return this.goals.update(u.userId, id, body, undefined, parseIfMatch(ifMatch));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be a numeric ID (1-19 digits)');
    }
    return this.goals.delete(u.userId, id, undefined, parseIfMatch(ifMatch));
  }

  @Patch(':id/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<GoalResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid goal id: must be a numeric ID (1-19 digits)');
    }
    return this.goals.restore(u.userId, id);
  }
}
