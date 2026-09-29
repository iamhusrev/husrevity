import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { Item, ItemKind, ItemSource, ItemStatus } from '../item.entity';
import { ItemOccurrenceStatus } from '../item-occurrence.entity';

export const ITEM_KINDS: ItemKind[] = ['task', 'event', 'log'];
export const ITEM_STATUSES: ItemStatus[] = ['open', 'done', 'cancelled'];
export const ITEM_SOURCES: ItemSource[] = [
  'web',
  'ios',
  'mcp',
  'telegram',
  'gmail',
  'gcal',
  'slack',
];

export class ItemRequestDto {
  @ApiProperty({ enum: ITEM_KINDS })
  @IsIn(ITEM_KINDS)
  kind!: ItemKind;

  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(32)
  context?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  projectId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  blockId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMin?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  /** Notification lead-time in minutes; null disables. 0 = at scheduledAt/dueAt exactly. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  notifyMinutesBefore?: number | null;

  @ApiPropertyOptional({
    description: 'Bare RFC5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR" — no DTSTART/prefix.',
  })
  @IsOptional()
  @MaxLength(512)
  rrule?: string | null;

  @ApiPropertyOptional({ enum: ITEM_STATUSES })
  @IsOptional()
  @IsIn(ITEM_STATUSES)
  status?: ItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ITEM_SOURCES })
  @IsOptional()
  @IsIn(ITEM_SOURCES)
  source?: ItemSource;
}

export class ItemListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ITEM_KINDS })
  @IsOptional()
  @IsIn(ITEM_KINDS)
  kind?: ItemKind;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(32)
  context?: string;

  @ApiPropertyOptional({ enum: ITEM_STATUSES })
  @IsOptional()
  @IsIn(ITEM_STATUSES)
  status?: ItemStatus;
}

export class ParseQuickAddRequestDto {
  @ApiProperty({ description: 'Raw quick-add text, e.g. "yarın 9da HGS kontrol #alican"' })
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}

export class CompleteItemRequestDto {
  /**
   * Required when the item (or its block parent) has an rrule — identifies
   * which date's virtual occurrence to mark done. Ignored for a plain
   * non-recurring item.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occursOn?: string;
}

export class ItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ITEM_KINDS }) kind!: ItemKind;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() notes!: string | null;
  @ApiPropertyOptional() context!: string | null;
  @ApiPropertyOptional() projectId!: string | null;
  @ApiPropertyOptional() blockId!: string | null;
  @ApiPropertyOptional() scheduledAt!: string | null;
  @ApiPropertyOptional() durationMin!: number | null;
  @ApiPropertyOptional() dueAt!: string | null;
  @ApiPropertyOptional() notifyMinutesBefore!: number | null;
  @ApiPropertyOptional() rrule!: string | null;
  @ApiProperty({ enum: ITEM_STATUSES }) status!: ItemStatus;
  @ApiPropertyOptional() completedAt!: string | null;
  @ApiProperty() payload!: Record<string, unknown>;
  @ApiProperty({ enum: ITEM_SOURCES }) source!: ItemSource;
  /** Present only on a virtual expanded occurrence of a recurring item (see GET /items). */
  @ApiPropertyOptional() occursOn?: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  /**
   * `overlay` is set when representing a virtual expanded occurrence of a
   * recurring item. `overlay.override` is only present when an
   * `item_occurrences` row exists for that date — its absence means the
   * occurrence is still in its default "open" state, so `status`/
   * `completedAt` fall back to the parent item's own fields (which stay
   * `'open'`/`null` forever for a recurring template — see complete()).
   */
  static from(
    item: Item,
    overlay?: {
      occursOn: string;
      override?: { status: ItemOccurrenceStatus; completedAt: Date | null };
    },
  ): ItemResponseDto {
    const status: ItemStatus = overlay?.override
      ? overlay.override.status === 'done'
        ? 'done'
        : 'cancelled' // 'skipped' has no direct ItemStatus counterpart
      : item.status;
    const completedAt = overlay?.override ? overlay.override.completedAt : item.completedAt;
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      context: item.context,
      projectId: item.projectId,
      blockId: item.blockId,
      scheduledAt: item.scheduledAt ? item.scheduledAt.toISOString() : null,
      durationMin: item.durationMin,
      dueAt: item.dueAt ? item.dueAt.toISOString() : null,
      notifyMinutesBefore: item.notifyMinutesBefore,
      rrule: item.rrule,
      status,
      completedAt: completedAt ? completedAt.toISOString() : null,
      payload: item.payload,
      source: item.source,
      occursOn: overlay?.occursOn,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
