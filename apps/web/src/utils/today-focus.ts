import type { LearningItemResponse, LearningTopicResponse } from "@/types/learning/learning";
import type { RoutineSegmentResponse } from "@/types/routine/routine";
import { dateYmdIstanbul, minutesOfDayIstanbul, segmentsForWeekday } from "./today-board";

export interface SegmentFocus {
  current: RoutineSegmentResponse | null;
  next: RoutineSegmentResponse | null;
}

const hasRange = (s: RoutineSegmentResponse): s is RoutineSegmentResponse & {
  startMinute: number;
  endMinute: number;
} => s.startMinute !== null && s.endMinute !== null;

/**
 * The Evkat segment running at `now` and the next one to start later today (Istanbul time).
 * When segments overlap (e.g. a 15-minute "weekly review" inside the family block) the one that
 * started last wins, because it is the more specific one. All-day segments are ignored.
 */
export function segmentFocus(segments: RoutineSegmentResponse[], now: Date): SegmentFocus {
  const minute = minutesOfDayIstanbul(now);
  const today = segmentsForWeekday(segments, now).filter(hasRange);

  const current =
    today
      .filter((s) => s.startMinute <= minute && minute < s.endMinute)
      .sort((a, b) => b.startMinute - a.startMinute)[0] ?? null;

  const next =
    today
      .filter((s) => s.startMinute > minute && s.id !== current?.id)
      .sort((a, b) => a.startMinute - b.startMinute)[0] ?? null;

  return { current, next };
}

export interface LearningAgendaEntry {
  item: LearningItemResponse;
  topicTitle: string;
}

/** Learning items whose review time falls on `ymd` (Istanbul), earliest first. */
export function learningAgendaForDay(
  topics: LearningTopicResponse[],
  ymd: string,
): LearningAgendaEntry[] {
  const entries: LearningAgendaEntry[] = [];
  for (const topic of topics) {
    const items = [...topic.items, ...topic.subtopics.flatMap((s) => s.items)];
    for (const item of items) {
      if (item.reviewAt && dateYmdIstanbul(item.reviewAt) === ymd) {
        entries.push({ item, topicTitle: topic.title });
      }
    }
  }
  return entries.sort((a, b) => (a.item.reviewAt! < b.item.reviewAt! ? -1 : 1));
}
