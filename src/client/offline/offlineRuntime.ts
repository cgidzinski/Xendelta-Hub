import { useEffect, useMemo, useState } from "react";
import { indexedDbStore } from "./kvStore";
import { createOfflineQueue, queuedDoneKeys, type QueuedItem } from "./offlineQueue";

/** The one on-device store and queue the app uses. */
export const offlineStore = indexedDbStore();
export const offlineQueue = createOfflineQueue(offlineStore);

/** This person's queued changes, kept current as they are added and sent. */
export function useQueuedItems(userId: string | undefined): QueuedItem[] {
  const [items, setItems] = useState<QueuedItem[]>([]);
  useEffect(() => {
    if (!userId) return setItems([]);
    let live = true;
    const refresh = () => void offlineQueue.forUser(userId).then((i) => live && setItems(i));
    refresh();
    const unsubscribe = offlineQueue.subscribe(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [userId]);
  return items;
}

/** "routineId:dueAt:occurrence" of every routine occurrence marked done offline and not yet sent. */
export function useQueuedDoneKeys(userId: string | undefined): Set<string> {
  const items = useQueuedItems(userId);
  return useMemo(() => queuedDoneKeys(items), [items]);
}
