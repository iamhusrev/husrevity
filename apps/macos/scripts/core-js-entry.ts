import { Settings } from 'luxon';
import { parseQuickAdd } from '../../../packages/parser/src/index';
import { expandOccurrences } from './core-js-expand';

/**
 * Entry of the JavaScriptCore bundle. Everything crosses the bridge as JSON strings.
 * The parser is async, so parseQuickAdd stores its settled result and the caller
 * collects it with takeResult() once the microtask queue has drained.
 */
let settled: string | null = null;

function fail(e: unknown): string {
  return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
}

(globalThis as any).HusrevityCore = {
  /** nowIso pins luxon's clock so the (clock-dependent) parser is deterministic. */
  parseQuickAdd(text: string, nowIso: string, _zone: string): void {
    settled = null;
    try {
      const ms = Date.parse(nowIso);
      if (Number.isNaN(ms)) throw new Error(`invalid now: ${nowIso}`);
      Settings.now = () => ms;
      parseQuickAdd(text).then(
        (draft) => {
          settled = JSON.stringify({ ok: draft });
        },
        (e) => {
          settled = fail(e);
        },
      );
    } catch (e) {
      settled = fail(e);
    }
  },
  takeResult(): string | null {
    const r = settled;
    settled = null;
    return r;
  },
  expandOccurrences(
    rrule: string,
    startIso: string,
    fromIso: string,
    toIso: string,
    zone: string,
  ): string {
    try {
      return JSON.stringify({ ok: expandOccurrences(rrule, startIso, fromIso, toIso, zone) });
    } catch (e) {
      return fail(e);
    }
  },
};
