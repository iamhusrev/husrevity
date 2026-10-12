import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIstanbulToday } from "./useIstanbulToday";

describe("useIstanbulToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Istanbul date and rolls over after Istanbul midnight without a remount", () => {
    // 20:59:30 UTC = 23:59:30 Istanbul on 2026-10-14.
    vi.setSystemTime(new Date("2026-10-14T20:59:30Z"));
    const { result } = renderHook(() => useIstanbulToday());
    expect(result.current).toBe("2026-10-14");

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe("2026-10-15");
  });

  it("does not re-render while the Istanbul date is unchanged", () => {
    vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useIstanbulToday();
    });
    const before = renders;
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(renders).toBe(before);
  });
});
