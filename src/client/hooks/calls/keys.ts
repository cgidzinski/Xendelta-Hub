export const callKeys = {
  all: ["calls"] as const,
  /** Whether calls are set up on this server. */
  status: () => [...callKeys.all, "status"] as const,
  /** The call going on in one chat, if any. */
  chat: (conversationId: string) => [...callKeys.all, "chat", conversationId] as const,
};
