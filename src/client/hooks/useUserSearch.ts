import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../config/api";

export interface SearchedUser {
  _id: string;
  username: string;
  avatar: string | null;
}

export function useUserSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", "search", debouncedQuery],
    queryFn: async () => {
      const res = await apiClient.get("/api/users/search", { params: { q: debouncedQuery } });
      return res.data.data as { users: SearchedUser[] };
    },
    enabled: true,
  });

  return {
    users: data?.users || [],
    isLoading,
    error,
  };
}