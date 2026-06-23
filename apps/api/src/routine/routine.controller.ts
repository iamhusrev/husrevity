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
import { RoutineService } from './routine.service';
import {
  ActivityRequestDto,
  ActivityResponseDto,
  RoutineReorderRequestDto,
  SegmentRequestDto,
  SegmentResponseDto,
} from './dto/routine-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('routine')
@ApiBearerAuth()
@Controller('routine')
export class RoutineController {
  constructor(private readonly routine: RoutineService) {}

  @Get('segments')
  listSegments(@CurrentUser() u: AuthenticatedUser): Promise<SegmentResponseDto[]> {
    return this.routine.listSegments(u.userId);
  }

  @Post('segments')
  @HttpCode(HttpStatus.CREATED)
  createSegment(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: SegmentRequestDto,
  ): Promise<SegmentResponseDto> {
    return this.routine.createSegment(u.userId, body);
  }

  @Patch('segments/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderSegments(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: RoutineReorderRequestDto,
  ): Promise<void> {
    return this.routine.reorderSegments(u.userId, body.items);
  }

  @Put('segments/:id')
  updateSegment(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SegmentRequestDto,
  ): Promise<SegmentResponseDto> {
    return this.routine.updateSegment(u.userId, id, body);
  }

  @Delete('segments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSegment(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.routine.deleteSegment(u.userId, id);
  }

  @Post('segments/:id/activities')
  @HttpCode(HttpStatus.CREATED)
  createActivity(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') segmentId: string,
    @Body() body: ActivityRequestDto,
  ): Promise<ActivityResponseDto> {
    return this.routine.createActivity(u.userId, segmentId, body);
  }

  @Patch('segments/:id/activities/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderActivities(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') segmentId: string,
    @Body() body: RoutineReorderRequestDto,
  ): Promise<void> {
    return this.routine.reorderActivities(u.userId, segmentId, body.items);
  }

  @Put('activities/:id')
  updateActivity(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') activityId: string,
    @Body() body: ActivityRequestDto,
  ): Promise<ActivityResponseDto> {
    return this.routine.updateActivity(u.userId, activityId, body);
  }

  @Delete('activities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteActivity(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') activityId: string,
  ): Promise<void> {
    return this.routine.deleteActivity(u.userId, activityId);
  }
}
