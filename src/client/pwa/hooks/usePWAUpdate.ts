import { useSyncExternalStore } from "react";
import { subscribeNeedRefresh, getNeedRefresh, applyUpdate } from "../swUpdate";

// Exposes whether a new service worker is waiting (needRefresh) and a reload() that
// activates it and reloads onto the new build.
export function usePWAUpdate() {
  const needRefresh = useSyncExternalStore(subscribeNeedRefresh, getNeedRefresh, getNeedRefresh);
  return { needRefresh, reload: applyUpdate };
}
