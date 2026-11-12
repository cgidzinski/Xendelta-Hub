import { xensplitKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import type { XenSplit } from "./types";
import { splitDeleted } from "./splitDeleted";

export function useXenSplit(groupId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: xensplitKeys.group(groupId),
    queryFn: async () => {
      return api.get<XenSplit>(`/api/xensplit/groups/${groupId}`);
    },
    // Keeps soft-deleted records out of group.expenses/settlements/exchanges for every
    // consumer, moving them to group.deleted for the views that reveal them.
    select: splitDeleted,
    enabled: !!groupId,
    staleTime: 0, // Always refetch in background
    // Only reuse cached data as a placeholder for this same group — otherwise
    // navigating from a different group briefly shows its stale currency/name/etc.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === groupId ? prev : undefined),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      name,
      default_currency,
      secondary_currencies,
    }: {
      name?: string;
      default_currency?: string;
      secondary_currencies?: string[];
    }) => {
      return api.put<XenSplit>(`/api/xensplit/groups/${groupId}`, {
        name,
        default_currency,
        secondary_currencies,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.groups() });
    },
  });

  const uploadGroupImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      return api.post<XenSplit>(`/api/xensplit/groups/${groupId}/image`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.groups() });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      return api.post<XenSplit>(`/api/xensplit/groups/${groupId}/members`, { memberIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/members/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
    },
  });

  return {
    group: data,
    isLoading,
    isError,
    error,
    refetch,
    updateGroup: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    uploadGroupImage: uploadGroupImageMutation.mutate,
    isUploadingImage: uploadGroupImageMutation.isPending,
    addMembers: addMembersMutation.mutate,
    isAddingMembers: addMembersMutation.isPending,
    removeMember: removeMemberMutation.mutate,
    isRemovingMember: removeMemberMutation.isPending,
  };
}
