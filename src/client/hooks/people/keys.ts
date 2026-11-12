export const peopleKeys = {
  all: ["people"] as const,
  known: () => [...peopleKeys.all, "known"] as const,
  search: (q: string) => [...peopleKeys.all, "search", q] as const,
  profile: (userId: string) => [...peopleKeys.all, "profile", userId] as const,
};
