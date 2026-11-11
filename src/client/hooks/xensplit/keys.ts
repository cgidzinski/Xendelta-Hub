// Every XenSplit query key, in one place. Mutations and socket handlers invalidate by these, so a
// key spelled differently in two files is a screen that silently stops refreshing.
export const xensplitKeys = {
  all: ["xensplit"] as const,
  groups: () => [...xensplitKeys.all, "groups"] as const,
  group: (groupId: string | undefined) => [...xensplitKeys.all, "group", groupId] as const,
  groupLog: (groupId: string | undefined) => [...xensplitKeys.all, "group", groupId, "log"] as const,
  balances: (groupId: string | undefined) => [...xensplitKeys.all, "balances", groupId] as const,
  expenseImageUrls: (groupId: string | undefined, expenseId?: string) =>
    [...xensplitKeys.all, "expense-image-urls", groupId, expenseId] as const,
  rate: (from: string, to: string) => [...xensplitKeys.all, "rate", from, to] as const,
};
