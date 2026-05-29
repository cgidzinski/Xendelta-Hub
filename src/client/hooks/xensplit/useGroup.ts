import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenSplit } from "./types";

export function useXenSplit(groupId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["xensplit", "group", groupId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/xensplit/groups/${groupId}`);
      return res.data.data as XenSplit;
    },
    enabled: !!groupId,
    staleTime: 0, // Always refetch in background
    placeholderData: (prev) => prev,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const res = await apiClient.put(`/api/xensplit/groups/${groupId}`, { name });
      return res.data.data as XenSplit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "groups"] });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/members`, { memberIds });
      return res.data.data as XenSplit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/members/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
    },
  });

  return {
    group: data,
    isLoading,
    isError,
    error,
    updateGroup: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    addMembers: addMembersMutation.mutate,
    isAddingMembers: addMembersMutation.isPending,
    removeMember: removeMemberMutation.mutate,
    isRemovingMember: removeMemberMutation.isPending,
  };
}