import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type {
  XenSplit,
  CreateXenSplitInput,
} from "./types";

export function useXenSplits() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["xensplit", "groups"],
    queryFn: async () => {
      const res = await apiClient.get("/api/xensplit/groups");
      return res.data.data as XenSplit[];
    },
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
    createGroup: createMutation.mutate,
    isCreating: createMutation.isPending,
    deleteGroup: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}