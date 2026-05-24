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
import { NoteService } from './note.service';
import {
  NoteRequestDto,
  NoteResponseDto,
  ReorderRequestDto,
  TagDto,
  TagRequestDto,
} from './dto/note-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('notes')
@ApiBearerAuth()
@Controller()
export class NoteController {
  constructor(private readonly notes: NoteService) {}

  @Get('notes')
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('tagId') tagId?: string,
    @Query('archived') archived?: string,
  ): Promise<NoteResponseDto[]> {
    const arch = archived === undefined ? undefined : archived === 'true';
    return this.notes.list(u.userId, q, tagId, arch);
  }

  @Get('notes/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<NoteResponseDto> {
    return this.notes.get(u.userId, id);
  }

  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: NoteRequestDto,
  ): Promise<NoteResponseDto> {
    return this.notes.create(u.userId, body);
  }

  @Put('notes/:id')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: NoteRequestDto,
  ): Promise<NoteResponseDto> {
    return this.notes.update(u.userId, id, body);
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.notes.delete(u.userId, id);
  }

  @Patch('notes/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@CurrentUser() u: AuthenticatedUser, @Body() body: ReorderRequestDto): Promise<void> {
    return this.notes.reorder(u.userId, body.items);
  }

  @Get('note-tags')
  listTags(@CurrentUser() u: AuthenticatedUser): Promise<TagDto[]> {
    return this.notes.listTags(u.userId);
  }

  @Post('note-tags')
  @HttpCode(HttpStatus.CREATED)
  createTag(@CurrentUser() u: AuthenticatedUser, @Body() body: TagRequestDto): Promise<TagDto> {
    return this.notes.createTag(u.userId, body);
  }

  @Delete('note-tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTag(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.notes.deleteTag(u.userId, id);
  }
}
