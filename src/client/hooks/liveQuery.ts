/**
 * For data that can change while you are on another screen — a book someone else is editing, your own drive from
 * another device. Mounting a screen re-reads it instead of serving whatever the cache held from the last visit
 * (the app-wide default is five minutes, which is what made "go to the list and come back" show old data).
 *
 * Use it for shared data only. Deliberately static data (a paint catalogue, a blog post) is better left to the
 * longer default so a screen does not refetch every time it opens.
 *
 * Kept as a literal so spreading it into `useQuery` does not widen the type of `data`.
 */
export const liveQuery = { staleTime: 30_000, refetchOnMount: "always" } as const;
