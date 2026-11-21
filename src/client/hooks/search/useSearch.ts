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

/** What the caller can open across the apps. An empty query disables record search. */
export const useSearch = (q: string) =>
  useQuery({
    queryKey: searchKeys.query(q),
    queryFn: async ({ signal }) =>
      (await api.get<{ groups: SearchGroup[] }>("/api/search", { params: { q }, signal })).groups,
    enabled: q !== "",
    staleTime: 60_000,
    retry: false,
  });
