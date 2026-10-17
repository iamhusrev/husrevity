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
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { parseIfMatch } from '../common/if-match';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectService } from './project.service';
import { ProjectRequestDto, ProjectResponseDto, ProjectUpdateRequestDto } from './dto/project-dtos';
import { ProjectListQueryDto } from './dto/project-list-query.dto';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectResponseDto[]> {
    return this.projects.list(u.userId, query.filter);
  }

  @Get(':projectId')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.getById(u.userId, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ProjectRequestDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.create(u.userId, body);
  }

  @Put(':projectId')
  @UseInterceptors(IdempotencyInterceptor)
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Body() body: ProjectUpdateRequestDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.update(u.userId, projectId, body, parseIfMatch(ifMatch));
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    return this.projects.delete(u.userId, projectId, parseIfMatch(ifMatch));
  }

  @Patch(':projectId/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.restore(u.userId, projectId);
  }
}
