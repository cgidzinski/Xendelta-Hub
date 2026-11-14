export const communityKeys = {
  all: ["communities"] as const,
  list: () => [...communityKeys.all, "list"] as const,
  detail: (id: string) => [...communityKeys.all, "detail", id] as const,
  /** Every community's channels (invalidate this to refresh them all). */
  allChannels: () => [...communityKeys.all, "channels"] as const,
  channels: (id: string) => [...communityKeys.allChannels(), id] as const,
  invites: () => [...communityKeys.all, "invites"] as const,
  /** Invitations a community has sent that nobody has answered yet. */
  pendingInvites: (id: string) => [...communityKeys.all, "pending-invites", id] as const,
};
