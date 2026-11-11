// Every XenBudget query key, in one place (see hooks/xensplit/keys.ts for why). The per-book
// queries all start with [xenbudget, <name>, bookId], so invalidating one by prefix also drops its
// parameterised variants.
export const xenbudgetKeys = {
  all: ["xenbudget"] as const,
  books: () => [...xenbudgetKeys.all, "books"] as const,
  /** One of the per-book queries by name: "items", "summary", "budget-status", ... */
  forBook: (name: string, bookId: string) => [...xenbudgetKeys.all, name, bookId] as const,
  book: (bookId: string) => xenbudgetKeys.forBook("book", bookId),
  items: (bookId: string, filters?: unknown) =>
    filters === undefined
      ? xenbudgetKeys.forBook("items", bookId)
      : ([...xenbudgetKeys.forBook("items", bookId), filters] as const),
  summary: (bookId: string, params?: unknown) =>
    params === undefined
      ? xenbudgetKeys.forBook("summary", bookId)
      : ([...xenbudgetKeys.forBook("summary", bookId), params] as const),
  recurring: (bookId: string, params?: unknown) =>
    params === undefined
      ? xenbudgetKeys.forBook("recurring", bookId)
      : ([...xenbudgetKeys.forBook("recurring", bookId), params] as const),
  merchants: (bookId: string, params?: unknown) =>
    params === undefined
      ? xenbudgetKeys.forBook("merchants", bookId)
      : ([...xenbudgetKeys.forBook("merchants", bookId), params] as const),
  budgetStatus: (bookId: string, ...rest: unknown[]) =>
    rest.length === 0
      ? xenbudgetKeys.forBook("budget-status", bookId)
      : ([...xenbudgetKeys.forBook("budget-status", bookId), ...rest] as const),
  imports: (bookId: string) => xenbudgetKeys.forBook("imports", bookId),
  categoryItemCounts: (bookId: string) => xenbudgetKeys.forBook("category-item-counts", bookId),
  itemImageUrls: (bookId: string, itemId?: string) =>
    [...xenbudgetKeys.forBook("item-image-urls", bookId), itemId] as const,
};
