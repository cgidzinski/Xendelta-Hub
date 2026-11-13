import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { memoryStore } from "./kvStore";
import {
  QUEUE_MAX_AGE_MS,
  classifyFailure,
  createOfflineQueue,
  isNetworkError,
  overlayQueuedTicks,
  queuedDoneKeys,
  requestFor,
  replayQueue,
  type QueuedAction,
} from "./offlineQueue";
import {
  SNAPSHOT_MAX_AGE_MS,
  clearPersistedCache,
  isRestorable,
  restoreCache,
  shouldPersist,
  snapshotOf,
  startPersisting,
} from "./queryPersistence";

const tick = (noteId: string, itemId: string, done: boolean): QueuedAction => ({
  kind: "note-tick",
  noteId,
  itemId,
  done,
});
const routineDone = (routineId: string, occurrence = 1, expectedDueAt = "2026-03-01T00:00:00.000Z"): QueuedAction => ({
  kind: "routine-done",
  routineId,
  occurrence,
  expectedDueAt,
});
const apiError = (status?: number, message = "nope") =>
  Object.assign(new Error(message), { status, response: status ? { status, data: { message } } : undefined });

describe("the offline queue", () => {
  it("keeps changes in order, per person, and survives a reload (the store)", async () => {
    const store = memoryStore();
    const q = createOfflineQueue(store);
    await q.add("ann", tick("n1", "i1", true), "Tick milk");
    await q.add("bob", tick("n2", "i2", true), "Tick eggs");
    await q.add("ann", routineDone("r1"), "Mark Filter as done");
    expect((await q.forUser("ann")).map((i) => i.label)).toEqual(["Tick milk", "Mark Filter as done"]);
    expect((await q.forUser("bob")).map((i) => i.label)).toEqual(["Tick eggs"]);

    const reopened = createOfflineQueue(store); // a new page load, same device
    expect((await reopened.list()).map((i) => i.userId)).toEqual(["ann", "bob", "ann"]);
  });

  it("lets a later tick of the same item replace the earlier one, and ignores a repeated 'done'", async () => {
    const q = createOfflineQueue(memoryStore());
    await q.add("ann", tick("n1", "i1", true), "Tick milk");
    await q.add("ann", tick("n1", "i2", true), "Tick eggs");
    await q.add("ann", tick("n1", "i1", false), "Untick milk");
    expect((await q.forUser("ann")).map((i) => [i.label, (i.action as any).done])).toEqual([
      ["Tick eggs", true],
      ["Untick milk", false],
    ]);

    await q.add("ann", routineDone("r1"), "Mark Filter as done");
    await q.add("ann", routineDone("r1"), "Mark Filter as done");
    await q.add("ann", routineDone("r1", 2), "Mark Filter as done (next)");
    expect((await q.forUser("ann")).filter((i) => i.action.kind === "routine-done")).toHaveLength(2);
  });

  it("only coalesces a person's own changes", async () => {
    const q = createOfflineQueue(memoryStore());
    await q.add("ann", tick("n1", "i1", true), "a");
    await q.add("bob", tick("n1", "i1", false), "b");
    expect(await q.list()).toHaveLength(2);
  });

  it("forgets changes that were never sent after a week, removes one, clears a person's, and tells subscribers", async () => {
    let now = 1_000_000;
    const store = memoryStore();
    const q = createOfflineQueue(store, () => now);
    const heard = vi.fn();
    q.subscribe(heard);
    await q.add("ann", tick("n1", "i1", true), "old");
    now += QUEUE_MAX_AGE_MS + 1;
    await q.add("ann", tick("n1", "i2", true), "new");
    expect(heard).toHaveBeenCalledTimes(2);
    expect((await createOfflineQueue(store, () => now).list()).map((i) => i.label)).toEqual(["new"]);

    const [item] = await q.list();
    await q.remove(item.id);
    expect(await q.list()).toEqual([]);
    await q.add("ann", tick("n", "i", true), "x");
    await q.add("bob", tick("n", "i", true), "y");
    await q.clearUser("ann");
    expect((await q.list()).map((i) => i.userId)).toEqual(["bob"]);
  });
});

describe("what a failure means", () => {
  it("a request that never got an answer is a network error", () => {
    expect(isNetworkError(apiError(undefined, "Network error"))).toBe(true);
    expect(isNetworkError(apiError(404))).toBe(false);
    expect(isNetworkError(null)).toBe(true);
  });
  it("retries later for no connection, a busy server or a timeout; drops what the server refused", () => {
    expect(classifyFailure(apiError(undefined))).toEqual({ done: false, drop: false });
    for (const s of [408, 429, 500, 502, 503])
      expect(classifyFailure(apiError(s)), String(s)).toEqual({ done: false, drop: false });
    for (const s of [400, 401, 403, 404, 409, 422])
      expect(classifyFailure(apiError(s, "That's gone")), String(s)).toEqual({
        done: false,
        drop: true,
        message: "That's gone",
      });
  });
});

describe("replayQueue", () => {
  const setup = async () => {
    const q = createOfflineQueue(memoryStore());
    await q.add("ann", tick("n1", "i1", true), "Tick milk");
    await q.add("ann", tick("n1", "i2", true), "Tick eggs");
    await q.add("ann", routineDone("r1"), "Mark Filter as done");
    await q.add("bob", tick("n9", "i9", true), "Bob's");
    return q;
  };

  it("sends everything in order, only the signed-in person's, and empties their part of the queue", async () => {
    const q = await setup();
    const sent: string[] = [];
    const result = await replayQueue(
      q,
      "ann",
      async (a) => void sent.push(a.kind === "note-tick" ? `${a.noteId}/${a.itemId}` : a.routineId),
    );
    expect(sent).toEqual(["n1/i1", "n1/i2", "r1"]);
    expect(result).toMatchObject({ remaining: 0, dropped: [] });
    expect((await q.list()).map((i) => i.userId)).toEqual(["bob"]);
  });

  it("stops when the connection is still down, leaving that change and the rest, so order is kept", async () => {
    const q = await setup();
    let calls = 0;
    const result = await replayQueue(q, "ann", async () => {
      if (++calls === 2) throw apiError(undefined);
    });
    expect(calls).toBe(2);
    expect(result.sent.map((i) => i.label)).toEqual(["Tick milk"]);
    expect(result.remaining).toBe(2);
    expect((await q.forUser("ann")).map((i) => i.label)).toEqual(["Tick eggs", "Mark Filter as done"]);
  });

  it("drops a change the server refuses for good, reports why, and carries on", async () => {
    const q = await setup();
    const result = await replayQueue(q, "ann", async (a) => {
      if (a.kind === "note-tick" && a.itemId === "i1") throw apiError(404, "That item isn't on this note any more");
      if (a.kind === "routine-done") throw apiError(409, "This routine changed. Refresh and try again.");
    });
    expect(result.sent.map((i) => i.label)).toEqual(["Tick eggs"]);
    expect(result.dropped.map((d) => [d.item.label, d.message])).toEqual([
      ["Tick milk", "That item isn't on this note any more"],
      ["Mark Filter as done", "This routine changed. Refresh and try again."],
    ]);
    expect(await q.forUser("ann")).toEqual([]);
  });

  it("does nothing for a person with nothing queued", async () => {
    const q = await setup();
    const send = vi.fn();
    expect(await replayQueue(q, "carol", send)).toEqual({ sent: [], dropped: [], remaining: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("showing what was done offline before it is sent", () => {
  const notes = [
    {
      _id: "n1",
      checklist: [
        { _id: "i1", done: false },
        { _id: "i2", done: true },
      ],
    },
    { _id: "n2", checklist: [{ _id: "i1", done: false }] },
  ];
  const item = (action: QueuedAction) => ({ id: "x", userId: "ann", action, label: "", at: 0 });

  it("applies queued ticks to the right note and item only", () => {
    const out = overlayQueuedTicks(notes, [item(tick("n1", "i1", true)), item(tick("n1", "i2", false))]);
    expect(out[0].checklist.map((c) => c.done)).toEqual([true, false]);
    expect(out[1]).toBe(notes[1]); // untouched notes are the same objects
  });
  it("returns the same list when nothing is queued", () => {
    expect(overlayQueuedTicks(notes, [])).toBe(notes);
    expect(overlayQueuedTicks(notes, [item(routineDone("r1"))])).toBe(notes);
  });
  it("lists the routine occurrences already marked done", () => {
    const keys = queuedDoneKeys([item(routineDone("r1", 1, "2026-03-01T00:00:00.000Z")), item(tick("n", "i", true))]);
    expect([...keys]).toEqual(["r1:2026-03-01T00:00:00.000Z:1"]);
  });
});

describe("what is kept for offline use", () => {
  const query = (queryKey: unknown[], status = "success") => ({ queryKey, state: { status } }) as any;

  it("keeps successful lists and items of the offline apps only", () => {
    expect(shouldPersist(query(["xennote", "notes", {}]))).toBe(true);
    expect(shouldPersist(query(["xenroutine", "routines"]))).toBe(true);
    expect(shouldPersist(query(["xenkitchen", "items", "q"]))).toBe(true);
    for (const key of [
      ["userProfile"],
      ["xensplit", "groups"],
      ["xenbudget", "books"],
      ["chat", "conversations"],
      ["admin", "users"],
      ["xendrive", "browse"],
    ]) {
      expect(shouldPersist(query(key)), JSON.stringify(key)).toBe(false);
    }
  });
  it("never keeps a public page, a failed query, or one still loading", () => {
    expect(shouldPersist(query(["xennote", "public-note", "token"]))).toBe(false);
    expect(shouldPersist(query(["xenkitchen", "public-book", "t"]))).toBe(false);
    expect(shouldPersist(query(["xennote", "notes"], "error"))).toBe(false);
    expect(shouldPersist(query(["xennote", "notes"], "pending"))).toBe(false);
  });

  const filled = () => {
    const c = new QueryClient();
    c.setQueryData(["xennote", "notes", {}], [{ _id: "n1", title: "Milk" }]);
    c.setQueryData(["xenroutine", "routines"], [{ _id: "r1" }]);
    c.setQueryData(["userProfile", "profile"], { email: "private@example.com" });
    c.setQueryData(["xennote", "public-note", "tok"], { title: "public" });
    return c;
  };

  it("saves only the allowed queries, and restores them for the same person", async () => {
    const store = memoryStore();
    const snap = snapshotOf(filled(), "ann");
    expect(snap.state.queries.map((q) => q.queryKey[0]).sort()).toEqual(["xennote", "xenroutine"]);
    expect(JSON.stringify(snap)).not.toContain("private@example.com");

    await store.set("query-cache", snap);
    const fresh = new QueryClient();
    expect(await restoreCache(fresh, store, "ann")).toBe(true);
    expect(fresh.getQueryData(["xennote", "notes", {}])).toEqual([{ _id: "n1", title: "Milk" }]);
    expect(fresh.getQueryData(["userProfile", "profile"])).toBeUndefined();
  });

  it("never restores one person's copy for another, and deletes it", async () => {
    const store = memoryStore();
    await store.set("query-cache", snapshotOf(filled(), "ann"));
    const fresh = new QueryClient();
    expect(await restoreCache(fresh, store, "bob")).toBe(false);
    expect(fresh.getQueryData(["xennote", "notes", {}])).toBeUndefined();
    expect(await store.get("query-cache")).toBeUndefined();
  });

  it("ignores a copy that is too old or from another version, and can be cleared", async () => {
    const snap = snapshotOf(filled(), "ann", 1_000);
    expect(isRestorable(snap, "ann", 1_000 + SNAPSHOT_MAX_AGE_MS)).toBe(true);
    expect(isRestorable(snap, "ann", 1_000 + SNAPSHOT_MAX_AGE_MS + 1)).toBe(false);
    expect(isRestorable({ ...snap, version: 99 }, "ann", 2_000)).toBe(false);
    expect(isRestorable(undefined, "ann")).toBe(false);

    const store = memoryStore();
    await store.set("query-cache", snap);
    await clearPersistedCache(store);
    expect(await store.get("query-cache")).toBeUndefined();
  });

  it("saves after the cache changes (not on every change), and once more when stopped", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      const client = new QueryClient();
      const stop = startPersisting(client, store, "ann", 1000);
      client.setQueryData(["xennote", "notes", {}], [{ _id: "n1" }]);
      client.setQueryData(["xennote", "notes", {}], [{ _id: "n1" }, { _id: "n2" }]);
      expect(await store.get("query-cache")).toBeUndefined(); // not yet: throttled
      await vi.advanceTimersByTimeAsync(1000);
      expect(((await store.get<any>("query-cache"))!.state.queries[0].state.data as unknown[]).length).toBe(2);
      client.setQueryData(["xennote", "notes", {}], [{ _id: "n1" }, { _id: "n2" }, { _id: "n3" }]);
      stop(); // saves the last change straight away
      await vi.advanceTimersByTimeAsync(0);
      expect(((await store.get<any>("query-cache"))!.state.queries[0].state.data as unknown[]).length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the request that sends a queued change", () => {
  it("ticks an item with the idempotent per-item endpoint", () => {
    expect(requestFor(tick("n1", "i2", true))).toEqual({
      method: "put",
      url: "/api/xennote/notes/n1/checklist/i2",
      body: { done: true },
    });
  });
  it("completes a routine on the routines path, with the due date that was on screen", () => {
    expect(requestFor(routineDone("r1", 2, "2026-03-01T00:00:00.000Z"))).toEqual({
      method: "post",
      url: "/api/xenroutine/routines/r1/complete",
      body: { occurrence: 2, expected_due_at: "2026-03-01T00:00:00.000Z" },
    });
  });
});
