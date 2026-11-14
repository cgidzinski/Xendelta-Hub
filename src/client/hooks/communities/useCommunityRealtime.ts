import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "../useRealtime";
import { communityKeys } from "./keys";

/**
 * Keeps the community caches current from what the server pushes. Mounted once while signed in, beside the chat's own
 * realtime (see useNavBarSocket). The server tells people that something changed and they refetch it.
 */
export function useCommunityRealtime() {
  const queryClient = useQueryClient();

  // Renamed, people or roles changed, or you are out of it (the server sends `removed`).
  useRealtime("community:updated", ({ communityId, removed }) => {
    if (removed) {
      queryClient.removeQueries({ queryKey: communityKeys.detail(communityId) });
      queryClient.removeQueries({ queryKey: communityKeys.channels(communityId) });
    } else {
      queryClient.invalidateQueries({ queryKey: communityKeys.detail(communityId) });
    }
    queryClient.invalidateQueries({ queryKey: communityKeys.list() });
  });

  // A channel was added, changed, reordered or deleted, or a role changed what someone can see.
  useRealtime("community:channels", ({ communityId }) => {
    queryClient.invalidateQueries({ queryKey: communityKeys.channels(communityId) });
  });

  // You were invited, or an invite to you was taken back.
  useRealtime("community:invite", () => {
    queryClient.invalidateQueries({ queryKey: communityKeys.invites() });
  });

  // A message in a channel moves that channel's unread count, and reading one clears it.
  useRealtime("chat:message", () => {
    queryClient.invalidateQueries({ queryKey: communityKeys.allChannels() });
  });
  useRealtime("chat:read", () => {
    queryClient.invalidateQueries({ queryKey: communityKeys.allChannels() });
  });
}
