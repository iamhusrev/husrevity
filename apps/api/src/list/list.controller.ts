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
import { ListService } from './list.service';
import {
  ItemRequestDto,
  ItemResponseDto,
  ListRequestDto,
  ListResponseDto,
  ReorderRequestDto,
  SectionRequestDto,
  SectionResponseDto,
} from './dto/list-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('lists')
@ApiBearerAuth()
@Controller()
export class ListController {
  constructor(private readonly lists: ListService) {}

  @Get('lists')
  list(@CurrentUser() u: AuthenticatedUser): Promise<ListResponseDto[]> {
    return this.lists.list(u.userId);
  }

  @Get('lists/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<ListResponseDto> {
    return this.lists.get(u.userId, id);
  }

  @Post('lists')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ListRequestDto,
  ): Promise<ListResponseDto> {
    return this.lists.create(u.userId, body);
  }

  @Put('lists/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ListRequestDto,
  ): Promise<ListResponseDto> {
    return this.lists.update(u.userId, id, body);
  }

  @Delete('lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.lists.delete(u.userId, id);
  }

  @Patch('lists/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderLists(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.lists.reorderLists(u.userId, body.items);
  }

  @Patch('lists/:id/sections/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderSections(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.lists.reorderSections(u.userId, listId, body.items);
  }

  @Get('lists/:id/sections')
  listSections(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
  ): Promise<SectionResponseDto[]> {
    return this.lists.listSections(u.userId, listId);
  }

  @Post('lists/:id/sections')
  @HttpCode(HttpStatus.CREATED)
  createSection(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
    @Body() body: SectionRequestDto,
  ): Promise<SectionResponseDto> {
    return this.lists.createSection(u.userId, listId, body);
  }

  @Put('list-sections/:id')
  updateSection(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') sectionId: string,
    @Body() body: SectionRequestDto,
  ): Promise<SectionResponseDto> {
    return this.lists.updateSection(u.userId, sectionId, body);
  }

  @Delete('list-sections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSection(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') sectionId: string,
  ): Promise<void> {
    return this.lists.deleteSection(u.userId, sectionId);
  }

  @Patch('lists/:id/items/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderItems(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
    @Body() body: ReorderRequestDto,
  ): Promise<void> {
    return this.lists.reorderItems(u.userId, listId, body.items);
  }

  @Get('lists/:id/items')
  listItems(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
  ): Promise<ItemResponseDto[]> {
    return this.lists.listItems(u.userId, listId);
  }

  @Post('lists/:id/items')
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') listId: string,
    @Body() body: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    return this.lists.createItem(u.userId, listId, body);
  }

  @Put('list-items/:id')
  updateItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') itemId: string,
    @Body() body: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    return this.lists.updateItem(u.userId, itemId, body);
  }

  @Post('list-items/:id/toggle')
  @HttpCode(HttpStatus.OK)
  toggleItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') itemId: string,
  ): Promise<ItemResponseDto> {
    return this.lists.toggleItem(u.userId, itemId);
  }

  @Delete('list-items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@CurrentUser() u: AuthenticatedUser, @Param('id') itemId: string): Promise<void> {
    return this.lists.deleteItem(u.userId, itemId);
  }
}
