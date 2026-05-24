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

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Get('projects/:code/tasks')
  listForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('code') code: string,
  ): Promise<TaskResponseDto[]> {
    return this.tasks.listForProject(u.userId, code);
  }

  @Post('projects/:code/tasks')
  @HttpCode(HttpStatus.CREATED)
  createForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.createForProject(u.userId, code, body);
  }

  @Patch('projects/:code/tasks/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderForProject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.tasks.reorderForProject(u.userId, code, body.items);
  }

  @Get('tasks/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<TaskResponseDto> {
    return this.tasks.get(u.userId, id);
  }

  @Put('tasks/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    return this.tasks.update(u.userId, id, body);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.tasks.delete(u.userId, id);
  }
}
