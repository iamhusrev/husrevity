export class BlockSummaryDto {
  itemId!: string;
  title!: string;
  scheduledAt!: string;
  durationMin!: number | null;
}

export class TimelineEntryDto {
  itemId!: string;
  title!: string;
  kind!: string;
  scheduledAt!: string;
  durationMin!: number | null;
  occursOn?: string;
}

export class ItemSummaryDto {
  itemId!: string;
  title!: string;
  dueAt!: string | null;
  status!: string;
}

export class TodayResponseDto {
  date!: string;
  currentBlock!: BlockSummaryDto | null;
  timeline!: TimelineEntryDto[];
  dueToday!: ItemSummaryDto[];
  suggestion!: string | null;
}
