import type { KeyValueStore } from "./kvStore";

// Changes made while offline, kept on the device and sent when the connection is back. Deliberately only the kinds of
// change that are safe to send late and send twice:
//   * ticking a note's checklist item: a "set this item to done/not done", which gives the same result however often and
//     whenever it is sent, and can't undo what others changed;
//   * marking a routine done: sent with the due date that was on screen, which the server checks (409 if it has moved),
//     so it can't complete a different occurrence, or the same one twice.
// Anything else (editing text, photos, money) is not queued: those need to be online.

export type QueuedAction =
  | { kind: "note-tick"; noteId: string; itemId: string; done: boolean }
  | { kind: "routine-done"; routineId: string; occurrence: number; expectedDueAt: string };

export interface QueuedItem {
  id: string;
  /** Whose change it is: another person signing in on this device must not send it. */
  userId: string;
  action: QueuedAction;
  /** What to call it when telling the person ("Tick milk", "Mark Filter as done"). */
  label: string;
  at: number;
}

/** A queued change that is never sent is dropped after this long. */
export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = "queue";

/** Two changes that say the same thing about the same thing: the later one replaces the earlier. */
const sameTarget = (a: QueuedAction, b: QueuedAction) =>
  a.kind === b.kind &&
  (a.kind === "note-tick"
    ? a.noteId === (b as typeof a).noteId && a.itemId === (b as typeof a).itemId
    : a.routineId === (b as typeof a).routineId &&
      a.occurrence === (b as typeof a).occurrence &&
      a.expectedDueAt === (b as typeof a).expectedDueAt);

export function createOfflineQueue(store: KeyValueStore, now: () => number = Date.now) {
  const listeners = new Set<() => void>();
  let cache: QueuedItem[] | null = null;
  let seq = 0;

  const load = async (): Promise<QueuedItem[]> => {
    // Expiry is checked on every read, so a page left open for a week still forgets stale changes.
    cache ??= (await store.get<QueuedItem[]>(KEY)) ?? [];
    cache = cache.filter((i) => now() - i.at <= QUEUE_MAX_AGE_MS);
    return cache;
  };
  const save = async (items: QueuedItem[]) => {
    cache = items;
    await store.set(KEY, items);
    listeners.forEach((fn) => fn());
  };

  return {
    list: load,
    /** The changes this person queued, oldest first. */
    async forUser(userId: string) {
      return (await load()).filter((i) => i.userId === userId);
    },
    async add(userId: string, action: QueuedAction, label: string): Promise<void> {
      const items = await load();
      // A later tick of the same item replaces the earlier one (and a repeat of "done" adds nothing).
      const kept = items.filter((i) => !(i.userId === userId && sameTarget(i.action, action)));
      await save([...kept, { id: `${now()}-${++seq}`, userId, action, label, at: now() }]);
    },
    async remove(id: string): Promise<void> {
      await save((await load()).filter((i) => i.id !== id));
    },
    async clearUser(userId: string): Promise<void> {
      await save((await load()).filter((i) => i.userId !== userId));
    },
    /** Called after every change; returns the unsubscribe. */
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type OfflineQueue = ReturnType<typeof createOfflineQueue>;

/** A request that never got an answer (offline, dropped, timed out) rather than one the server refused. */
export const isNetworkError = (error: unknown): boolean => {
  const status =
    (error as { status?: number; response?: { status?: number } } | null)?.status ??
    (error as { response?: { status?: number } } | null)?.response?.status;
  return status === undefined;
};

export type ReplayOutcome =
  | { done: true }
  /** The server refused it for good (the note is gone, the routine moved): drop it and say why. */
  | { done: false; drop: true; message: string }
  /** Couldn't reach the server, or it was busy: leave it and try again later. */
  | { done: false; drop: false };

/** What to do with a queued change after sending it failed. */
export function classifyFailure(error: unknown): Exclude<ReplayOutcome, { done: true }> {
  if (isNetworkError(error)) return { done: false, drop: false };
  const status =
    (error as { status?: number; response?: { status?: number } }).status ??
    (error as { response?: { status?: number } }).response?.status ??
    0;
  // 408 and 429 and anything from the server's side are worth another go; any other 4xx is the server saying no.
  if (status === 408 || status === 429 || status >= 500) return { done: false, drop: false };
  const message =
    (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ??
    (error as Error).message ??
    "The server refused it";
  return { done: false, drop: true, message };
}

export interface ReplayResult {
  sent: QueuedItem[];
  dropped: Array<{ item: QueuedItem; message: string }>;
  /** Left in the queue (the connection is still down). */
  remaining: number;
}

/**
 * Send this person's queued changes in order. Stops at the first one that can't be sent for lack of a connection (the rest
 * would fail the same way, and the order matters); drops one the server refuses for good and carries on.
 */
export async function replayQueue(
  queue: OfflineQueue,
  userId: string,
  send: (action: QueuedAction) => Promise<void>,
): Promise<ReplayResult> {
  const result: ReplayResult = { sent: [], dropped: [], remaining: 0 };
  const items = await queue.forUser(userId);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      await send(item.action);
      await queue.remove(item.id);
      result.sent.push(item);
    } catch (error) {
      const outcome = classifyFailure(error);
      if (outcome.drop) {
        await queue.remove(item.id);
        result.dropped.push({ item, message: outcome.message });
      } else {
        result.remaining = items.length - i;
        return result;
      }
    }
  }
  return result;
}

/** Notes with the queued ticks applied, so a note shows what the person did even before it has been sent. */
export function overlayQueuedTicks<T extends { _id: string; checklist: Array<{ _id?: string; done: boolean }> }>(
  notes: T[],
  items: QueuedItem[],
): T[] {
  const ticks = items.flatMap((i) => (i.action.kind === "note-tick" ? [i.action] : []));
  if (ticks.length === 0) return notes;
  return notes.map((note) => {
    const mine = ticks.filter((t) => t.noteId === note._id);
    if (mine.length === 0) return note;
    return {
      ...note,
      checklist: note.checklist.map((c) => ({ ...c, done: mine.find((t) => t.itemId === c._id)?.done ?? c.done })),
    };
  });
}

/** The routine occurrences already marked done offline, as "routineId:dueAt:occurrence", to hide them from the list. */
export function queuedDoneKeys(items: QueuedItem[]): Set<string> {
  return new Set(
    items.flatMap((i) =>
      i.action.kind === "routine-done"
        ? [`${i.action.routineId}:${i.action.expectedDueAt}:${i.action.occurrence}`]
        : [],
    ),
  );
}
