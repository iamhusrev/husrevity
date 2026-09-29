import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncQueryDto, SyncResponseDto } from './dto/sync-dtos';
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
      notes: result.notes.live.map(NoteResponseDto.from),
      projects: result.projects.live.map((p) => ProjectResponseDto.from(p)),
      tombstones: {
        items: result.items.tombstoneIds,
        notes: result.notes.tombstoneIds,
        projects: result.projects.tombstoneIds,
      },
      cursor: result.cursor,
    };
  }
}
