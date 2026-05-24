import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectService } from './project.service';
import { ProjectRequestDto, ProjectResponseDto, ProjectUpdateRequestDto } from './dto/project-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  list(@CurrentUser() u: AuthenticatedUser): Promise<ProjectResponseDto[]> {
    return this.projects.list(u.userId);
  }

  @Get(':code')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @Param('code') code: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.getByCode(u.userId, code);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ProjectRequestDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.create(u.userId, body);
  }

  @Put(':code')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: ProjectUpdateRequestDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.update(u.userId, code, body);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string): Promise<void> {
    return this.projects.delete(u.userId, code);
  }
}
