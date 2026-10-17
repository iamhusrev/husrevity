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
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: NoteRequestDto,
  ): Promise<NoteResponseDto> {
    return this.notes.create(u.userId, body);
  }

  @Put('notes/:id')
  @UseInterceptors(IdempotencyInterceptor)
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: NoteRequestDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<NoteResponseDto> {
    return this.notes.update(u.userId, id, body, parseIfMatch(ifMatch));
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    return this.notes.delete(u.userId, id, parseIfMatch(ifMatch));
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
  @UseInterceptors(IdempotencyInterceptor)
  createTag(@CurrentUser() u: AuthenticatedUser, @Body() body: TagRequestDto): Promise<TagDto> {
    return this.notes.createTag(u.userId, body);
  }

  @Delete('note-tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  deleteTag(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.notes.deleteTag(u.userId, id);
  }
}
