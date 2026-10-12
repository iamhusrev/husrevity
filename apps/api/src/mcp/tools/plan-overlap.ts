import { DateTime } from 'luxon';

const ISTANBUL = 'Europe/Istanbul';

/** A null duration counts as this many minutes, for the overlap check only (never stored). */
export const DEFAULT_OVERLAP_DURATION_MIN = 30;

export const MAX_OVERLAP_WARNINGS = 100;

export interface OverlapRef {
  source: 'plan' | 'existing';
  operationIndex?: number;
  itemId?: string;
  title: string;
  scheduledAt: string;
  durationMin: number | null;
  occursOn?: string;
}

export interface OverlapWarning {
  type: 'overlap';
  message: string;
  between: [OverlapRef, OverlapRef];
}

interface Window {
  ref: OverlapRef;
  day: string;
  start: number;
  end: number;
}

export function rebuildScheduledInstant(scheduledAt: string, occursOn?: string): string {
  if (!occursOn) return scheduledAt;
  const templateDt = DateTime.fromISO(scheduledAt, { setZone: true }).setZone(ISTANBUL);
  if (!templateDt.isValid) return scheduledAt;
  const rebuiltDt = DateTime.fromISO(occursOn, { zone: ISTANBUL }).set({
    hour: templateDt.hour,
    minute: templateDt.minute,
    second: templateDt.second,
    millisecond: templateDt.millisecond,
  });
  return rebuiltDt.isValid ? rebuiltDt.toISO()! : scheduledAt;
}

function toWindow(ref: OverlapRef): Window | null {
  const instant = ref.occursOn
    ? rebuildScheduledInstant(ref.scheduledAt, ref.occursOn)
    : ref.scheduledAt;
  const start = DateTime.fromISO(instant, { setZone: true });
  if (!start.isValid) return null;
  const minutes = ref.durationMin ?? DEFAULT_OVERLAP_DURATION_MIN;
  const startMs = start.toMillis();
  return {
    ref,
    day: start.setZone(ISTANBUL).toISODate() ?? '',
    start: startMs,
    end: startMs + minutes * 60_000,
  };
}

function intersects(a: Window, b: Window): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function refLabel(ref: OverlapRef): string {
  const where =
    ref.source === 'plan'
      ? `planned #${ref.operationIndex ?? '?'}`
      : `existing #${ref.itemId ?? '?'}`;
  return `"${ref.title}" (${where}, ${ref.scheduledAt})`;
}

/**
 * Reports pairs of scheduled windows `[scheduledAt, scheduledAt + duration)` that intersect on the
 * same Europe/Istanbul day (day of the window start). Pairs are planned-vs-planned and
 * planned-vs-existing only; windows that merely touch do not overlap.
 */
export function findOverlaps(
  planned: OverlapRef[],
  existing: OverlapRef[],
  limit: number = MAX_OVERLAP_WARNINGS,
): OverlapWarning[] {
  const plannedWindows = planned.map(toWindow).filter((w): w is Window => w !== null);
  const existingWindows = existing.map(toWindow).filter((w): w is Window => w !== null);
  const warnings: OverlapWarning[] = [];

  const push = (a: Window, b: Window): boolean => {
    warnings.push({
      type: 'overlap',
      message: `Overlap: ${refLabel(a.ref)} intersects ${refLabel(b.ref)}`,
      between: [a.ref, b.ref],
    });
    return warnings.length >= limit;
  };

  for (let i = 0; i < plannedWindows.length; i++) {
    for (let j = i + 1; j < plannedWindows.length; j++) {
      if (
        intersects(plannedWindows[i], plannedWindows[j]) &&
        push(plannedWindows[i], plannedWindows[j])
      ) {
        return warnings;
      }
    }
    for (const other of existingWindows) {
      if (intersects(plannedWindows[i], other) && push(plannedWindows[i], other)) return warnings;
    }
  }
  return warnings;
}
