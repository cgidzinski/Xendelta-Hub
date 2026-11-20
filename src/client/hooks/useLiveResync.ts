import type { QueryClient } from "@tanstack/react-query";

/**
 * The root query keys of everything other people (or your other devices) can change while a socket is down.
 *
 * The server emits each update once, to the people who are connected at that moment; nothing is queued. So when a
 * connection comes back — after a phone woke up, a laptop was opened, a tunnel dropped — the open screens have to
 * re-read what they missed. Invalidating a root refetches it if it is on screen and marks it stale if it is not,
 * so this is one pass, not a stampede.
 *
 * One entry per app, using the same root its key factory uses (XenBudget's `all` is the string `xenbudget`, and so
 * on). An app that starts pushing realtime events belongs here too: `useLiveResync.test.ts` lists the apps that must be
 * covered so the two lists cannot drift apart.
 */
export const LIVE_ROOTS = [
  "calls",
  "chat",
  "communities",
  "emoji",
  "feed",
  "inbox",
  "people",
  "presence",
  "userNotifications",
  "userProfile",
  "xenbudget",
  "xendrive",
  "xenkitchen",
  "xennote",
  "xenroutine",
  "xensplit",
  "xenstart",
] as const;

export type LiveRoot = (typeof LIVE_ROOTS)[number];

/** Catch up on everything that changed while the socket was not listening. */
export function resyncLiveQueries(queryClient: QueryClient): void {
  for (const root of LIVE_ROOTS) void queryClient.invalidateQueries({ queryKey: [root] });
}
