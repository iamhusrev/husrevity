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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { ReorderRequestDto, TaskRequestDto, TaskResponseDto } from './dto/task-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Get('projects/:projectId/tasks')
  listForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<TaskResponseDto[]> {
    return this.tasks.listForProject(u.userId, projectId);
  }

  @Post('projects/:projectId/tasks')
  @HttpCode(HttpStatus.CREATED)
  createForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Body() body: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.createForProject(u.userId, projectId, body);
  }

  @Patch('projects/:projectId/tasks/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.tasks.reorderForProject(u.userId, projectId, body.items);
  }

  @Get('tasks/:id')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<TaskResponseDto> {
    return this.tasks.get(u.userId, id);
  }

  @Put('tasks/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.update(u.userId, u.email, id, body);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<void> {
    return this.tasks.delete(u.userId, id);
  }

  @Patch('tasks/:id/restore')
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<TaskResponseDto> {
    return this.tasks.restore(u.userId, id);
  }
}
