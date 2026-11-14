export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => [...chatKeys.all, "conversations"] as const,
  conversation: (id: string) => [...chatKeys.all, "conversation", id] as const,
  messages: (id: string) => [...chatKeys.all, "messages", id] as const,
  /** A window of history around one message, loaded for a jump. */
  around: (id: string, seq?: number) =>
    (seq === undefined ? [...chatKeys.all, "around", id] : [...chatKeys.all, "around", id, seq]) as readonly unknown[],
  /** The messages pinned in one chat. */
  pins: (id: string) => [...chatKeys.all, "pins", id] as const,
  /** A message search: its words, filters and scope. */
  search: (params: Record<string, unknown>) => [...chatKeys.all, "search", params] as const,
  unread: () => [...chatKeys.all, "unread"] as const,
};
