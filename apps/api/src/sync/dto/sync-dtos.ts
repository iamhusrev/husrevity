import { IsDateString, IsOptional } from 'class-validator';
import { ItemResponseDto } from '../../item/dto/item-dtos';
import { NoteResponseDto } from '../../note/dto/note-dtos';
import { ProjectResponseDto } from '../../project/dto/project-dtos';
import { Goal, GoalHorizon, GoalStatus } from '../../goal/goal.entity';
import { ItemOccurrence, ItemOccurrenceStatus } from '../../item/item-occurrence.entity';
import { NoteTag } from '../../note/note-tag.entity';

export class SyncQueryDto {
  /** ISO timestamp cursor from a previous sync response; omit for a full initial sync. */
  @IsOptional()
  @IsDateString()
  since?: string;
}

export class SyncTombstonesDto {
  items!: string[];
  itemOccurrences!: string[];
  notes!: string[];
  noteTags!: string[];
  projects!: string[];
  goals!: string[];
}

/**
 * Raw goal row for offline clients. Unlike `GoalResponseDto` it carries no
 * server-computed `progress`: that is derived from items and child goals, so
 * a client with its own copy of both computes it locally.
 */
export class SyncGoalDto {
  id!: string;
  title!: string;
  notes!: string | null;
  horizon!: GoalHorizon;
  periodStart!: string;
  periodEnd!: string;
  parentGoalId!: string | null;
  status!: GoalStatus;
  createdAt!: string;
  updatedAt!: string;

  static from(g: Goal): SyncGoalDto {
    return {
      id: g.id,
      title: g.title,
      notes: g.notes ?? null,
      horizon: g.horizon,
      periodStart: toDateString(g.periodStart),
      periodEnd: toDateString(g.periodEnd),
      parentGoalId: g.parentGoalId ?? null,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    };
  }
}

export class SyncItemOccurrenceDto {
  id!: string;
  itemId!: string;
  /** Local (Europe/Istanbul) calendar date, `YYYY-MM-DD`. */
  occursOn!: string;
  status!: ItemOccurrenceStatus;
  completedAt!: string | null;
  updatedAt!: string;

  static from(o: ItemOccurrence): SyncItemOccurrenceDto {
    return {
      id: o.id,
      itemId: o.itemId,
      occursOn: toDateString(o.occursOn),
      status: o.status,
      completedAt: o.completedAt ? o.completedAt.toISOString() : null,
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}

export class SyncNoteTagDto {
  id!: string;
  name!: string;
  color!: string | null;
  updatedAt!: string;

  static from(t: NoteTag): SyncNoteTagDto {
    return { id: t.id, name: t.name, color: t.color ?? null, updatedAt: t.updatedAt.toISOString() };
  }
}

export class SyncResponseDto {
  items!: ItemResponseDto[];
  itemOccurrences!: SyncItemOccurrenceDto[];
  notes!: NoteResponseDto[];
  noteTags!: SyncNoteTagDto[];
  projects!: ProjectResponseDto[];
  goals!: SyncGoalDto[];
  tombstones!: SyncTombstonesDto;
  /** Pass this back as `since` on the next call. */
  cursor!: string;
}

function toDateString(d: string | Date): string {
  return typeof d === 'string' ? d : d.toISOString().slice(0, 10);
}
