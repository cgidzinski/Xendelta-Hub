import { useQuery } from "@tanstack/react-query";
import { api } from "../../config/api";
import { searchKeys } from "./keys";

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  link: string;
}
export interface SearchGroup {
  kind: string;
  label: string;
  hits: SearchHit[];
}

/** What the caller can open across the apps for `q` (at least two characters). Results are kept for a minute. */
export const useSearch = (q: string) =>
  useQuery({
    queryKey: searchKeys.query(q),
    queryFn: async () => (await api.get<{ groups: SearchGroup[] }>("/api/search", { params: { q } })).groups,
    enabled: q.length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    retry: false,
  });
