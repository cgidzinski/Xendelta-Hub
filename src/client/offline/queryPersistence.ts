import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";
import type { KeyValueStore } from "./kvStore";

// What the app remembers between visits so recent notes, routines and recipes open with no connection. It is a copy of part
// of the query cache (react-query's own dehydrate/hydrate), kept per person on this device: a different person signing in
// never sees it, and signing out deletes it. Only these apps' lists and items are kept, never anything public or personal
// (profile, messages, money).

const KEY = "query-cache";
export const SNAPSHOT_VERSION = 1;
/** A saved copy older than this isn't restored (what it holds is too stale to be worth showing). */
export const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PERSISTED_APPS = new Set(["xennote", "xenroutine", "xenkitchen"]);

export interface Snapshot {
  version: number;
  userId: string;
  savedAt: number;
  state: DehydratedState;
}

/** Should this query be kept? Successful, from one of the offline apps, and not a public page. */
export function shouldPersist(query: Pick<Query, "queryKey" | "state">): boolean {
  if (query.state.status !== "success") return false;
  const key = query.queryKey as unknown[];
  if (typeof key[0] !== "string" || !PERSISTED_APPS.has(key[0])) return false;
  return !key.some((part) => typeof part === "string" && part.startsWith("public"));
}

export const snapshotOf = (client: QueryClient, userId: string, now = Date.now()): Snapshot => ({
  version: SNAPSHOT_VERSION,
  userId,
  savedAt: now,
  state: dehydrate(client, { shouldDehydrateQuery: shouldPersist }),
});

/** Is a saved copy fit to restore for this person right now? */
export const isRestorable = (s: Snapshot | undefined, userId: string, now = Date.now()): s is Snapshot =>
  !!s && s.version === SNAPSHOT_VERSION && s.userId === userId && now - s.savedAt <= SNAPSHOT_MAX_AGE_MS;

/** Put the saved copy back into the cache. Returns whether anything was restored. A copy for someone else is deleted. */
export async function restoreCache(
  client: QueryClient,
  store: KeyValueStore,
  userId: string,
  now = Date.now(),
): Promise<boolean> {
  const saved = await store.get<Snapshot>(KEY);
  if (!isRestorable(saved, userId, now)) {
    if (saved) await store.delete(KEY);
    return false;
  }
  hydrate(client, saved.state);
  return true;
}

export const clearPersistedCache = (store: KeyValueStore) => store.delete(KEY);

/**
 * Save the cache whenever it changes, at most once every `throttleMs`. Returns a stop function that also saves once more.
 */
export function startPersisting(
  client: QueryClient,
  store: KeyValueStore,
  userId: string,
  throttleMs = 2000,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    void store.set(KEY, snapshotOf(client, userId));
  };
  const unsubscribe = client.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, throttleMs);
  });
  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
}
