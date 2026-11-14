export const presenceKeys = {
  all: ["presence"] as const,
  /** Your own settings, and how the people you share a chat or community with look. */
  list: () => [...presenceKeys.all, "list"] as const,
};
