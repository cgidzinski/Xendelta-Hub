import { xensplitKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import type { XenSplit, CreateXenSplitInput } from "./types";
import { splitDeleted } from "./splitDeleted";

export function useXenSplits() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: xensplitKeys.groups(),
    queryFn: async () => {
      return api.get<XenSplit[]>("/api/xensplit/groups");
    },
    // The group cards total group.expenses directly, so deleted records have to be out
    // of that array before it reaches them.
    select: (groups: XenSplit[]) => groups.map(splitDeleted),
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateXenSplitInput) => {
      return api.post<XenSplit>("/api/xensplit/groups", input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.groups() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await apiClient.delete(`/api/xensplit/groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.groups() });
    },
  });

  return {
    groups: data || [],
    isLoading,
    isError,
    error,
    refetch,
    createGroup: createMutation.mutate,
    isCreating: createMutation.isPending,
    deleteGroup: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
