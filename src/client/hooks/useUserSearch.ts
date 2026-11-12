import { useState, useEffect } from "react";
import type { PublicUser } from "../types/user";
import { useQuery } from "@tanstack/react-query";
import { api } from "../config/api";

export type SearchedUser = PublicUser;

export function useUserSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", "search", debouncedQuery],
    queryFn: async () => {
      return api.get<{ users: SearchedUser[] }>("/api/users/search", { params: { q: debouncedQuery } });
    },
    enabled: true,
  });

  return {
    users: data?.users || [],
    isLoading,
    error,
  };
}
