export interface BlockSummary {
  itemId: string;
  title: string;
  scheduledAt: string;
  durationMin: number | null;
}

export interface TimelineEntry {
  itemId: string;
  title: string;
  kind: string;
  scheduledAt: string;
  durationMin: number | null;
  occursOn?: string;
}

export interface ItemSummary {
  itemId: string;
  title: string;
  dueAt: string | null;
  status: string;
}

export interface TodayResponse {
  date: string;
  currentBlock: BlockSummary | null;
  timeline: TimelineEntry[];
  dueToday: ItemSummary[];
  suggestion: string | null;
}
