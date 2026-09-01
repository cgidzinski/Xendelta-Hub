import { useEffect, useRef, useState } from "react";

// Minimal shape of the Screen Wake Lock API - not in this TS lib target.
interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

/**
 * Hold a screen wake lock while `active`, so a phone propped up next to the paint pots
 * doesn't dim mid-step.
 *
 * Feature-detected and entirely best-effort: unsupported browsers (Safari before 16.4,
 * Firefox) and a rejected request are silently ignored - the screen just behaves normally.
 * The browser drops the lock whenever the tab is hidden, so it is re-acquired on
 * visibilitychange rather than assumed to persist.
 */
export function useWakeLock(active: boolean): { isSupported: boolean } {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const [isSupported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);

  useEffect(() => {
    if (!active || !isSupported) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible" || sentinel.current) return;
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        sentinel.current = lock;
        // Released by the browser on tab switch; clear our handle so we can re-acquire.
        lock.addEventListener("release", () => {
          sentinel.current = null;
        });
      } catch {
        // Denied (low battery, permissions policy) - nothing to do but carry on.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel.current?.release().catch(() => {});
      sentinel.current = null;
    };
  }, [active, isSupported]);

  return { isSupported };
}
