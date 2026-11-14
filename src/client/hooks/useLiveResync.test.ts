import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { LIVE_ROOTS, resyncLiveQueries } from "./useLiveResync";

/**
 * Every app that pushes realtime events (shared/realtime.ts) must resync on reconnect, because the events sent while
 * a tab was disconnected are gone for good. Chat, communities and presence ride on the same socket. If you add an
 * event for a new app, add its query root here.
 */
const APPS_THAT_PUSH_EVENTS = [
  "chat",
  "communities",
  "emoji",
  "feed",
  "presence",
  "userNotifications",
  "xenbudget",
  "xenkitchen",
  "xennote",
  "xenroutine",
  "xensplit",
];

describe("live resync", () => {
  it("covers every app that pushes realtime events", () => {
    const roots: readonly string[] = LIVE_ROOTS;
    expect(roots.filter((root) => APPS_THAT_PUSH_EVENTS.includes(root)).sort()).toEqual(
      [...APPS_THAT_PUSH_EVENTS].sort(),
    );
  });

  it("lists each root once", () => {
    expect(new Set(LIVE_ROOTS).size).toBe(LIVE_ROOTS.length);
  });

  it("invalidates every root, so an open screen refetches and a closed one is marked stale", () => {
    const invalidateQueries = vi.fn();
    resyncLiveQueries({ invalidateQueries } as unknown as QueryClient);
    expect(invalidateQueries.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)).toEqual(
      LIVE_ROOTS.map((root) => [root]),
    );
  });
});
