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
import { ProjectService } from './project.service';
import { ProjectRequestDto, ProjectResponseDto, ProjectUpdateRequestDto } from './dto/project-dtos';
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
    @Query('filter') filter?: 'all' | 'mine' | 'shared',
  ): Promise<ProjectResponseDto[]> {
    return this.projects.list(u.userId, filter);
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
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ProjectRequestDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.create(u.userId, body);
  }

  @Put(':projectId')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Body() body: ProjectUpdateRequestDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.update(u.userId, projectId, body);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<void> {
    return this.projects.delete(u.userId, projectId);
  }

  @Patch(':projectId/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.restore(u.userId, projectId);
  }
}
