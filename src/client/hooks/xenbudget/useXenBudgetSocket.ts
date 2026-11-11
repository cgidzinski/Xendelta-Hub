import { useQueryClient } from "@tanstack/react-query";
import { useSocketEvent, useSocketInvalidate } from "../useSocketEvent";
import { invalidateItemDerived } from "./invalidate";

/**
 * Keeps an open book in sync with edits made by other members. This is what makes the
 * monthly tally live: the server emits after every mutation, and every member's open
 * Overview re-fetches its summary.
 */
export function useXenBudgetSocket(bookId: string) {
  const queryClient = useQueryClient();
  useSocketEvent<{ bookId: string }>("xenbudget:book_update", (data) => {
    if (data.bookId === bookId) invalidateItemDerived(queryClient, bookId);
  });
}

export function useXenBudgetBooksSocket() {
  useSocketInvalidate("xenbudget:books_updated", [["xenbudget", "books"]]);
}
