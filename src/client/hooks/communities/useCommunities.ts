import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Community, CommunityChannel, MyCommunityInvite } from "@shared/communities";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { communityKeys } from "./keys";

// ---------- reading ----------

/** The communities the caller is in, newest first. */
export function useCommunities() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: communityKeys.list(),
    queryFn: async () => (await api.get<{ communities: Community[] }>("/api/communities")).communities,
    enabled: isAuthenticated,
  });
}

export function useCommunity(communityId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: communityKeys.detail(communityId ?? ""),
    queryFn: async () => (await api.get<{ community: Community }>(`/api/communities/${communityId}`)).community,
    enabled: isAuthenticated && !!communityId,
    retry: false,
  });
}

/** The channels the caller can see in a community, in sidebar order, with their own unread and mute state. */
export function useChannels(communityId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: communityKeys.channels(communityId ?? ""),
    queryFn: async () =>
      (await api.get<{ channels: CommunityChannel[] }>(`/api/communities/${communityId}/channels`)).channels,
    enabled: isAuthenticated && !!communityId,
    retry: false,
  });
}

/** Invites waiting for the caller's answer. */
export function useMyCommunityInvites() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: communityKeys.invites(),
    queryFn: async () => (await api.get<{ invites: MyCommunityInvite[] }>("/api/community-invites")).invites,
    enabled: isAuthenticated,
  });
}

// ---------- changing ----------

/** What you can do from the rail and the sidebar. Each refreshes what it changed. */
export function useCommunityActions() {
  const queryClient = useQueryClient();

  const createCommunity = useMutation({
    mutationFn: async (input: { name: string }) =>
      (await api.post<{ community: Community }>("/api/communities", input)).community,
    onSuccess: (community) => {
      queryClient.setQueryData(communityKeys.detail(community._id), community);
      queryClient.invalidateQueries({ queryKey: communityKeys.list() });
    },
  });

  const createChannel = useMutation({
    mutationFn: async (input: { communityId: string; name: string; topic?: string; category?: string }) => {
      const { communityId, ...body } = input;
      return (await api.post<{ channel: CommunityChannel }>(`/api/communities/${communityId}/channels`, body)).channel;
    },
    onSuccess: (_channel, input) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.channels(input.communityId) });
    },
  });

  /** Say yes or no to an invite. Joining adds the community to the list. */
  const respondToInvite = useMutation({
    mutationFn: (input: { communityId: string; accept: boolean }) =>
      api.put<{ joined: boolean; communityId?: string }>(`/api/community-invites/${input.communityId}`, {
        accept: input.accept,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.invites() });
      queryClient.invalidateQueries({ queryKey: communityKeys.list() });
    },
  });

  /** Leave a community (the owner can't: hand it over or delete it). */
  const leave = useMutation({
    mutationFn: (communityId: string) => api.delete<unknown>(`/api/communities/${communityId}/membership`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: communityKeys.all }),
  });

  const setChannelMuted = useMutation({
    mutationFn: (input: { channelId: string; muted: boolean }) =>
      api.patch<unknown>(`/api/chat/conversations/${input.channelId}/me`, { muted: input.muted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.allChannels() });
    },
  });

  return { createCommunity, createChannel, respondToInvite, leave, setChannelMuted };
}
