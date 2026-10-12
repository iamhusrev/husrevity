import { useEffect, useState } from "react";
import { dateYmdIstanbul } from "@/utils/today-board";

const TICK_MS = 60_000;

/**
 * Today's calendar date (YYYY-MM-DD) in Europe/Istanbul.
 *
 * The value is derived on every render, so it is never older than the last
 * render. A once-per-minute tick keeps an idle tab honest: it only updates
 * state (and therefore re-renders) when the Istanbul date actually changes.
 */
export function useIstanbulToday(): string {
  const [, setTickYmd] = useState(() => dateYmdIstanbul(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      const next = dateYmdIstanbul(new Date());
      setTickYmd((cur) => (cur === next ? cur : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return dateYmdIstanbul(new Date());
}
