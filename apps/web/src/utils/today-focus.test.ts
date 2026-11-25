import { describe, expect, it } from "vitest";
import type { LearningItemResponse, LearningTopicResponse } from "@/types/learning/learning";
import type { RoutineSegmentResponse } from "@/types/routine/routine";
import { learningAgendaForDay, segmentFocus } from "./today-focus";

const seg = (
  id: string,
  startMinute: number | null,
  endMinute: number | null,
  daysOfWeek = 127,
): RoutineSegmentResponse =>
  ({
    id,
    name: id,
    startMinute,
    endMinute,
    theme: null,
    colorToken: null,
    daysOfWeek,
    notes: null,
    position: 0,
    activities: [],
  }) as unknown as RoutineSegmentResponse;

// 2026-11-25 is a Wednesday; 08:53 UTC is 11:53 in Istanbul.
const WED_1153 = new Date("2026-11-25T08:53:00Z");

describe("segmentFocus", () => {
  const segments = [
    seg("sabah", 390, 465),
    seg("is", 480, 1080, 31),
    seg("aile", 1080, 1260),
    seg("aksam", 1260, 1380),
  ];

  it("returns the running segment and the next one", () => {
    const { current, next } = segmentFocus(segments, WED_1153);
    expect(current?.id).toBe("is");
    expect(next?.id).toBe("aile");
  });

  it("returns no current segment in a gap and still finds the next", () => {
    const { current, next } = segmentFocus(segments, new Date("2026-11-25T04:50:00Z")); // 07:50
    expect(current).toBeNull();
    expect(next?.id).toBe("is");
  });

  it("skips segments that do not run on this weekday", () => {
    const sunday = new Date("2026-11-29T08:53:00Z");
    expect(segmentFocus(segments, sunday).current).toBeNull();
  });

  it("prefers the segment that started last when two overlap", () => {
    const review = seg("kontrol", 1245, 1260, 127);
    const { current } = segmentFocus(
      [...segments, review],
      new Date("2026-11-25T17:50:00Z"), // 20:50
    );
    expect(current?.id).toBe("kontrol");
  });

  it("ignores all-day segments", () => {
    expect(segmentFocus([seg("all", null, null)], WED_1153)).toEqual({ current: null, next: null });
  });
});

describe("learningAgendaForDay", () => {
  const item = (id: string, reviewAt: string | null): LearningItemResponse => ({
    id,
    topicId: "t",
    subtopicId: null,
    text: id,
    url: null,
    notes: null,
    estimatedMinutes: null,
    reviewAt,
    notifyMinutesBefore: null,
    completedAt: null,
    position: 0,
  });

  it("collects items due on the Istanbul day from topics and subtopics, earliest first", () => {
    const topic = {
      id: "t",
      title: "SQL",
      items: [item("late", "2026-12-01T18:00:00Z")],
      subtopics: [
        { items: [item("early", "2026-12-01T07:00:00Z"), item("other-day", "2026-12-02T18:00:00Z")] },
      ],
    } as unknown as LearningTopicResponse;

    expect(learningAgendaForDay([topic], "2026-12-01").map((e) => e.item.id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("uses the Istanbul calendar day, not UTC", () => {
    // 22:30 UTC on 30 Nov is 01:30 on 1 Dec in Istanbul.
    const topic = {
      id: "t",
      title: "SQL",
      items: [item("after-midnight", "2026-11-30T22:30:00Z")],
      subtopics: [],
    } as unknown as LearningTopicResponse;
    expect(learningAgendaForDay([topic], "2026-12-01")).toHaveLength(1);
  });
});
