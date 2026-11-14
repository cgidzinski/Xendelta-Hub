export const emojiKeys = {
  all: ["emoji"] as const,
  /** Every custom emoji the person can use, from all their communities and chats. */
  list: () => [...emojiKeys.all, "list"] as const,
};
