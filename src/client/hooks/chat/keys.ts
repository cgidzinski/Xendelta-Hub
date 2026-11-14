export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => [...chatKeys.all, "conversations"] as const,
  conversation: (id: string) => [...chatKeys.all, "conversation", id] as const,
  messages: (id: string) => [...chatKeys.all, "messages", id] as const,
  /** The messages pinned in one chat. */
  pins: (id: string) => [...chatKeys.all, "pins", id] as const,
  /** A message search: its words, filters and scope. */
  search: (params: Record<string, unknown>) => [...chatKeys.all, "search", params] as const,
  unread: () => [...chatKeys.all, "unread"] as const,
};
