import { LearningTopicResponse } from "@/types/learning/learning";

export type YearTabId = "all" | number;

export interface YearTabDef {
  id: YearTabId;
  count: number;
}

const YEAR_KEY = "learning.year";

/**
 * The year a topic is filed under. The API always resolves `year`; the creation-year fallback only
 * covers stale cached responses from before the field existed (or a corrupt value).
 */
export function topicYear(topic: LearningTopicResponse): number {
  return Number.isFinite(topic.year) ? topic.year : new Date(topic.createdAt).getFullYear();
}

/**
 * "All" first, then every year newest first with its topic count. The current year is always a
 * tab, even while it has no topics, so a fresh year never looks like a missing feature.
 */
export function buildYearTabs(topics: LearningTopicResponse[], currentYear: number): YearTabDef[] {
  const counts = new Map<number, number>([[currentYear, 0]]);
  for (const topic of topics) {
    const year = topicYear(topic);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const years = [...counts.entries()]
    .sort(([a], [b]) => b - a)
    .map(([id, count]) => ({ id, count }));
  return [{ id: "all", count: topics.length }, ...years];
}

/**
 * Choices for the topic year field: every year that already has a topic, the current year and the
 * three before it (so an older study year can be opened without a topic there yet), newest first,
 * each once. `extra` keeps an edited topic's own year selectable even if it falls outside that set.
 */
export function yearOptions(
  topics: LearningTopicResponse[],
  currentYear: number,
  extra?: number,
): number[] {
  const years = new Set<number>(topics.map(topicYear));
  for (let offset = 0; offset <= 3; offset++) years.add(currentYear - offset);
  if (extra !== undefined) years.add(extra);
  return [...years].sort((a, b) => b - a);
}

export function readStoredYear(): YearTabId {
  try {
    const stored = Number(localStorage.getItem(YEAR_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : "all";
  } catch {
    return "all";
  }
}

export function writeStoredYear(year: YearTabId) {
  try {
    localStorage.setItem(YEAR_KEY, String(year));
  } catch {
    // Ignore: the filter just won't persist.
  }
}
