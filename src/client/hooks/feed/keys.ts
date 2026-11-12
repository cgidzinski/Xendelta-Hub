export const feedKeys = {
  all: ["feed"] as const,
  /** Every feed list, whatever the app filter (to refetch the open one). */
  lists: () => [...feedKeys.all, "list"] as const,
  list: (app?: string) => [...feedKeys.lists(), app ?? "all"] as const,
  attention: () => [...feedKeys.all, "attention"] as const,
  prefs: () => [...feedKeys.all, "prefs"] as const,
};
