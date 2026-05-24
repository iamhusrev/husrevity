import { useCallback, useEffect, useState } from "react";
import { pushService } from "@/services/push-service";

export type PushStatus =
  | { state: "loading" }
  | { state: "unsupported" }
  | { state: "default" }
  | { state: "denied" }
  | { state: "granted-subscribed" }
  | { state: "granted-unsubscribed" };

export function usePushStatus(): {
  status: PushStatus;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<PushStatus>({ state: "loading" });

  const refresh = useCallback(async () => {
    if (!pushService.isSupported()) {
      setStatus({ state: "unsupported" });
      return;
    }
    const perm = pushService.permissionState();
    if (perm === "denied") return setStatus({ state: "denied" });
    if (perm !== "granted") return setStatus({ state: "default" });
    const sub = await pushService.getCurrentSubscription();
    setStatus({
      state: sub ? "granted-subscribed" : "granted-unsubscribed",
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}

export function useEnablePush() {
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const enable = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const res = await pushService.enablePush();
      if (!res.ok) setLastError(res.reason ?? "unknown");
      return res;
    } finally {
      setLoading(false);
    }
  }, []);
  return { enable, loading, lastError };
}

export function useDisablePush() {
  const [loading, setLoading] = useState(false);
  const disable = useCallback(async () => {
    setLoading(true);
    try {
      await pushService.disablePush();
    } finally {
      setLoading(false);
    }
  }, []);
  return { disable, loading };
}
