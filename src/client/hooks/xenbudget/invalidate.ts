import type { QueryClient } from "@tanstack/react-query";

/**
 * Everything derived from a book's items, invalidated together.
 *
 * The list, the tallies, the budget bars, the book's own review counts and the two
 * history-derived analyses are all answers to "what is in this book" — so anything that
 * moves money makes every one of them stale at once, and they must never be seen
 * disagreeing with each other.
 *
 * This lives in one place because it is invalidated from four (item mutations, imports,
 * a rules sweep, and another member's socket update). Adding a derived query and updating
 * three of the four is the failure this prevents: a panel that silently keeps showing
 * pre-import figures.
 */
export function invalidateItemDerived(queryClient: QueryClient, bookId: string): void {
    for (const key of ["items", "summary", "budget-status", "book", "recurring", "merchants"]) {
        queryClient.invalidateQueries({ queryKey: ["xenbudget", key, bookId] });
    }
}
