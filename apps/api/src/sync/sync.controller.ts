import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import {
  SyncGoalDto,
  SyncItemOccurrenceDto,
  SyncNoteTagDto,
  SyncQueryDto,
  SyncResponseDto,
} from './dto/sync-dtos';
import { ItemResponseDto } from '../item/dto/item-dtos';
import { NoteResponseDto } from '../note/dto/note-dtos';
import { ProjectResponseDto } from '../project/dto/project-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  async get(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ): Promise<SyncResponseDto> {
    const since = query.since ? new Date(query.since) : null;
    const result = await this.sync.syncSince(u.userId, since);
    return {
      items: result.items.live.map((i) => ItemResponseDto.from(i)),
      itemOccurrences: result.itemOccurrences.live.map(SyncItemOccurrenceDto.from),
      notes: result.notes.live.map(NoteResponseDto.from),
      noteTags: result.noteTags.live.map(SyncNoteTagDto.from),
      projects: result.projects.live.map((p) => ProjectResponseDto.from(p)),
      goals: result.goals.live.map(SyncGoalDto.from),
      tombstones: {
        items: result.items.tombstoneIds,
        itemOccurrences: result.itemOccurrences.tombstoneIds,
        notes: result.notes.tombstoneIds,
        noteTags: result.noteTags.tombstoneIds,
        projects: result.projects.tombstoneIds,
        goals: result.goals.tombstoneIds,
      },
      cursor: result.cursor,
    };
  }
}
