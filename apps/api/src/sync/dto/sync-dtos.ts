import { IsDateString, IsOptional } from 'class-validator';
import { ItemResponseDto } from '../../item/dto/item-dtos';
import { NoteResponseDto } from '../../note/dto/note-dtos';
import { ProjectResponseDto } from '../../project/dto/project-dtos';

export class SyncQueryDto {
  /** ISO timestamp cursor from a previous sync response; omit for a full initial sync. */
  @IsOptional()
  @IsDateString()
  since?: string;
}

export class SyncTombstonesDto {
  items!: string[];
  notes!: string[];
  projects!: string[];
}

export class SyncResponseDto {
  items!: ItemResponseDto[];
  notes!: NoteResponseDto[];
  projects!: ProjectResponseDto[];
  tombstones!: SyncTombstonesDto;
  /** Pass this back as `since` on the next call. */
  cursor!: string;
}
