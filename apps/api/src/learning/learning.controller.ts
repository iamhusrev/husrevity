import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { ItemRequestDto, ItemResponseDto, LearningReorderRequestDto, TopicRequestDto, TopicResponseDto } from './dto/learning-dtos';
import { LearningService } from './learning.service';

@ApiTags('learning')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('topics') listTopics(@CurrentUser() u: AuthenticatedUser): Promise<TopicResponseDto[]> { return this.learning.listTopics(u.userId); }
  @Post('topics') @HttpCode(HttpStatus.CREATED) createTopic(@CurrentUser() u: AuthenticatedUser, @Body() body: TopicRequestDto): Promise<TopicResponseDto> { return this.learning.createTopic(u.userId, body); }
  @Patch('topics/reorder') @HttpCode(HttpStatus.NO_CONTENT) reorderTopics(@CurrentUser() u: AuthenticatedUser, @Body() body: LearningReorderRequestDto): Promise<void> { return this.learning.reorderTopics(u.userId, body.items); }
  @Put('topics/:id') updateTopic(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: TopicRequestDto): Promise<TopicResponseDto> { return this.learning.updateTopic(u.userId, id, body); }
  @Delete('topics/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteTopic(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> { return this.learning.deleteTopic(u.userId, id); }
  @Post('topics/:id/items') @HttpCode(HttpStatus.CREATED) createItem(@CurrentUser() u: AuthenticatedUser, @Param('id') topicId: string, @Body() body: ItemRequestDto): Promise<ItemResponseDto> { return this.learning.createItem(u.userId, topicId, body); }
  @Patch('topics/:id/items/reorder') @HttpCode(HttpStatus.NO_CONTENT) reorderItems(@CurrentUser() u: AuthenticatedUser, @Param('id') topicId: string, @Body() body: LearningReorderRequestDto): Promise<void> { return this.learning.reorderItems(u.userId, topicId, body.items); }
  @Put('items/:id') updateItem(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: ItemRequestDto): Promise<ItemResponseDto> { return this.learning.updateItem(u.userId, id, body); }
  @Delete('items/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteItem(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> { return this.learning.deleteItem(u.userId, id); }
  @Post('items/:id/toggle') @HttpCode(HttpStatus.OK) toggleItem(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<ItemResponseDto> { return this.learning.toggleItem(u.userId, id); }
}
