import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { PublicUser } from "../../types/user";
import { peopleKeys } from "./keys";

/** Someone in a picker or list. `sharedCount` is how many spaces you share with them (0 for a stranger). */
export type SearchedUser = PublicUser & { sharedCount?: number };
export interface KnownPerson extends PublicUser {
  sharedCount: number;
  /** Labels of the apps those spaces are in, e.g. ["XenBudget", "XenSplit"]. */
  apps: string[];
}
export interface SharedSpace {
  app: string;
  label: string;
  id: string;
  name: string;
  link: string;
}
export interface Profile {
  user: PublicUser & { joinedAt: string };
  isSelf: boolean;
  sharedSpaces: SharedSpace[];
}

/** The server returns nothing for a shorter search, so the client doesn't ask. */
export const SEARCH_MIN_LENGTH = 2;
const KNOWN_STALE_MS = 30_000;

/** Everyone you share a space with, most shared first. */
export function useKnownPeople() {
  const { data, isLoading, error } = useQuery({
    queryKey: peopleKeys.known(),
    queryFn: async () => (await api.get<{ people: KnownPerson[] }>("/api/people")).people,
    staleTime: KNOWN_STALE_MS,
  });
  return { people: data ?? [], isLoading, error };
}

/** Search every user by username prefix, debounced. Known people come first. */
export function usePeopleSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const q = debounced.trim();
  const enabled = q.length >= SEARCH_MIN_LENGTH;
  const { data, isFetching, error } = useQuery({
    queryKey: peopleKeys.search(q),
    queryFn: async () => (await api.get<{ users: SearchedUser[] }>("/api/users/search", { params: { q } })).users,
    enabled,
  });
  // Typing ahead of the debounce is still loading: the shown results are for an older query.
  const pending = query.trim() !== q;
  return { users: enabled ? (data ?? []) : [], isLoading: enabled && (isFetching || pending), enabled, error };
}

/**
 * What a picker lists: the people you know (narrowed by what is typed), then everyone else who matches the search.
 * With nothing typed, only the people you know.
 */
export function usePeopleOptions(query: string) {
  const known = useKnownPeople();
  const search = usePeopleSearch(query);

  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const knownMatches = needle ? known.people.filter((p) => p.username.toLowerCase().includes(needle)) : known.people;
    const knownIds = new Set(knownMatches.map((p) => p._id));
    const others = search.users.filter((u) => !knownIds.has(u._id));
    return {
      known: knownMatches as SearchedUser[],
      others,
      isLoading: known.isLoading || search.isLoading,
      /** True once the search box holds enough to search everyone. */
      searching: search.enabled,
    };
  }, [known.people, known.isLoading, search.users, search.isLoading, search.enabled, query]);
}

/** A person's public profile and the spaces you share with them. */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: peopleKeys.profile(userId ?? ""),
    queryFn: () => api.get<Profile>(`/api/users/${userId}`),
    enabled: Boolean(userId),
    retry: false,
  });
}
