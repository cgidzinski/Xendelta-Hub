import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type {
  XenSplit,
  CreateXenSplitInput,
} from "./types";
import { splitDeleted } from "./splitDeleted";

export function useXenSplits() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["xensplit", "groups"],
    queryFn: async () => {
      const res = await apiClient.get("/api/xensplit/groups");
      return res.data.data as XenSplit[];
    },
    // The group cards total group.expenses directly, so deleted records have to be out
    // of that array before it reaches them.
    select: (groups: XenSplit[]) => groups.map(splitDeleted),
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateXenSplitInput) => {
      const res = await apiClient.post("/api/xensplit/groups", input);
      return res.data.data as XenSplit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "groups"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await apiClient.delete(`/api/xensplit/groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "groups"] });
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