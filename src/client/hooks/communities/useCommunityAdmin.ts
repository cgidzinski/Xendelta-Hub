import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChannelOverride,
  Community,
  CommunityChannel,
  CommunityPermission,
  PendingCommunityInvite,
} from "@shared/communities";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { communityKeys } from "./keys";

/** Invitations this community has sent that nobody has answered yet. Only for people who can invite. */
export function usePendingInvites(communityId: string, enabled: boolean) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: communityKeys.pendingInvites(communityId),
    queryFn: async () =>
      (await api.get<{ invites: PendingCommunityInvite[] }>(`/api/communities/${communityId}/invites`)).invites,
    enabled: isAuthenticated && enabled,
  });
}

export interface RoleInput {
  name: string;
  color: string;
  permissions: CommunityPermission[];
}

/** Everything a person with the right permissions can change in one community. Each refreshes what it touched. */
export function useCommunityAdmin(communityId: string) {
  const queryClient = useQueryClient();
  const base = `/api/communities/${communityId}`;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: communityKeys.detail(communityId) });
    queryClient.invalidateQueries({ queryKey: communityKeys.list() });
    queryClient.invalidateQueries({ queryKey: communityKeys.channels(communityId) });
    queryClient.invalidateQueries({ queryKey: communityKeys.pendingInvites(communityId) });
  };
  /** The answer is the whole community: put it in the cache, then refresh the rest. */
  const setCommunity = (community: Community) => {
    queryClient.setQueryData(communityKeys.detail(communityId), community);
    refresh();
  };

  const rename = useMutation({
    mutationFn: async (name: string) => (await api.patch<{ community: Community }>(base, { name })).community,
    onSuccess: setCommunity,
  });
  const remove = useMutation({
    mutationFn: () => api.delete<unknown>(base),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: communityKeys.all }),
  });

  // ---- channels
  const updateChannel = useMutation({
    mutationFn: async (input: { channelId: string; name?: string; topic?: string; category?: string }) => {
      const { channelId, ...body } = input;
      return (await api.patch<{ channel: CommunityChannel }>(`${base}/channels/${channelId}`, body)).channel;
    },
    onSuccess: refresh,
  });
  const deleteChannel = useMutation({
    mutationFn: (channelId: string) => api.delete<unknown>(`${base}/channels/${channelId}`),
    onSuccess: refresh,
  });
  /** Every channel, top to bottom, with the category each now sits under. */
  const reorderChannels = useMutation({
    mutationFn: (channels: Array<{ id: string; category: string }>) =>
      api.put<unknown>(`${base}/channels/order`, { channels }),
    onSuccess: refresh,
  });
  const setOverrides = useMutation({
    mutationFn: (input: { channelId: string; overrides: ChannelOverride[] }) =>
      api.put<unknown>(`${base}/channels/${input.channelId}/overrides`, { overrides: input.overrides }),
    onSuccess: refresh,
  });

  // ---- roles
  const createRole = useMutation({
    mutationFn: async (input: RoleInput) =>
      (await api.post<{ community: Community }>(`${base}/roles`, input)).community,
    onSuccess: setCommunity,
  });
  const updateRole = useMutation({
    mutationFn: async (input: { roleId: string } & Partial<RoleInput>) => {
      const { roleId, ...body } = input;
      return (await api.patch<{ community: Community }>(`${base}/roles/${roleId}`, body)).community;
    },
    onSuccess: setCommunity,
  });
  const deleteRole = useMutation({
    mutationFn: async (roleId: string) =>
      (await api.delete<{ community: Community }>(`${base}/roles/${roleId}`)).community,
    onSuccess: setCommunity,
  });
  /** Every role except everyone, highest first. */
  const reorderRoles = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.put<{ community: Community }>(`${base}/roles/order`, { ids })).community,
    onSuccess: setCommunity,
  });

  // ---- people
  const setMemberRoles = useMutation({
    mutationFn: async (input: { userId: string; roleIds: string[] }) =>
      (await api.put<{ community: Community }>(`${base}/members/${input.userId}/roles`, { roleIds: input.roleIds }))
        .community,
    onSuccess: setCommunity,
  });
  const removeMember = useMutation({
    mutationFn: async (userId: string) =>
      (await api.delete<{ community: Community }>(`${base}/members/${userId}`)).community,
    onSuccess: setCommunity,
  });
  const makeOwner = useMutation({
    mutationFn: async (userId: string) =>
      (await api.patch<{ community: Community }>(`${base}/owner`, { userId })).community,
    onSuccess: setCommunity,
  });
  const invite = useMutation({
    mutationFn: (userIds: string[]) => api.post<{ invited: number }>(`${base}/invites`, { userIds }),
    onSuccess: refresh,
  });
  const cancelInvite = useMutation({
    mutationFn: (userId: string) => api.delete<unknown>(`${base}/invites/${userId}`),
    onSuccess: refresh,
  });

  return {
    rename,
    remove,
    updateChannel,
    deleteChannel,
    reorderChannels,
    setOverrides,
    createRole,
    updateRole,
    deleteRole,
    reorderRoles,
    setMemberRoles,
    removeMember,
    makeOwner,
    invite,
    cancelInvite,
  };
}
