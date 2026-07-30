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
import { PlanService } from './plan.service';
import {
  PlanItemRequestDto,
  PlanItemResponseDto,
  PlanRequestDto,
  PlanResponseDto,
} from './dto/plan-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('plans')
@ApiBearerAuth()
@Controller()
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @Get('plans')
  list(@CurrentUser() u: AuthenticatedUser): Promise<PlanResponseDto[]> {
    return this.plans.list(u.userId);
  }

  @Get('plans/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<PlanResponseDto> {
    return this.plans.get(u.userId, id);
  }

  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: PlanRequestDto,
  ): Promise<PlanResponseDto> {
    return this.plans.create(u.userId, body);
  }

  @Put('plans/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PlanRequestDto,
  ): Promise<PlanResponseDto> {
    return this.plans.update(u.userId, id, body);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.plans.delete(u.userId, id);
  }

  @Patch('plans/:id/restore')
  restore(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<PlanResponseDto> {
    return this.plans.restore(u.userId, id);
  }

  @Get('plans/:id/items')
  listItems(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') planId: string,
  ): Promise<PlanItemResponseDto[]> {
    return this.plans.listItems(u.userId, planId);
  }

  @Post('plans/:id/items')
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') planId: string,
    @Body() body: PlanItemRequestDto,
  ): Promise<PlanItemResponseDto> {
    return this.plans.createItem(u.userId, planId, body);
  }

  @Put('plan-items/:id')
  updateItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') itemId: string,
    @Body() body: PlanItemRequestDto,
  ): Promise<PlanItemResponseDto> {
    return this.plans.updateItem(u.userId, itemId, body);
  }

  @Delete('plan-items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@CurrentUser() u: AuthenticatedUser, @Param('id') itemId: string): Promise<void> {
    return this.plans.deleteItem(u.userId, itemId);
  }

  @Patch('plan-items/:id/restore')
  restoreItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') itemId: string,
  ): Promise<PlanItemResponseDto> {
    return this.plans.restoreItem(u.userId, itemId);
  }
}
