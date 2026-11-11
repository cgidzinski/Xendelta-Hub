import { xenbudgetKeys } from "./keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { XenBudgetBook } from "./types";

export interface LabelInput {
  name?: string;
  color?: string;
  need_want?: "need" | "want" | "none";
}

export type LabelKind = "categories" | "flags";

/**
 * CRUD for one of a book's two label registries.
 *
 * Parameterised rather than duplicated: categories and flags differ in meaning, not in
 * how they are managed. Every mutation invalidates the items and the tallies as well as
 * the book — a rename rewrites the label on every item that carried it and a delete
 * strips it, so anything derived from items is stale the moment either succeeds.
 */
export function useXenBudgetLabels(bookId: string, kind: LabelKind) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: xenbudgetKeys.book(bookId) });
    queryClient.invalidateQueries({ queryKey: xenbudgetKeys.items(bookId) });
    queryClient.invalidateQueries({ queryKey: xenbudgetKeys.summary(bookId) });
    queryClient.invalidateQueries({ queryKey: xenbudgetKeys.budgetStatus(bookId) });
  };

  const base = `/api/xenbudget/books/${bookId}/${kind}`;

  const createMutation = useMutation({
    mutationFn: async (input: LabelInput) => {
      return api.post<XenBudgetBook>(base, input);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ labelId, input }: { labelId: string; input: LabelInput }) => {
      return api.put<XenBudgetBook>(`${base}/${labelId}`, input);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (labelId: string) => {
      return api.delete<XenBudgetBook>(`${base}/${labelId}`);
    },
    onSuccess: invalidate,
  });

  return {
    createLabelAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateLabelAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteLabelAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * How many items currently carry each category, keyed by name — for the count shown next
 * to a chip in Settings > Categories, and to decide whether deleting one needs a
 * confirmation. Not part of `useXenBudgetLabels`'s invalidation set: it's a display-only
 * figure that refetches whenever the Categories settings page is opened, rather than being
 * wired into every item mutation's invalidation list.
 */
export function useXenBudgetCategoryItemCounts(bookId: string) {
  const query = useQuery({
    queryKey: xenbudgetKeys.categoryItemCounts(bookId),
    queryFn: async () => {
      return api.get<Record<string, number>>(`/api/xenbudget/books/${bookId}/categories/counts`);
    },
    enabled: !!bookId,
  });

  return { counts: query.data ?? {}, isLoading: query.isLoading };
}

/**
 * Re-seeds a book's missing starter categories and built-in flags in one call. Additive
 * only - the server re-adds what's gone and leaves the rest alone.
 */
export function useXenBudgetReseedLabels(bookId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post<XenBudgetBook>(`/api/xenbudget/books/${bookId}/reseed-labels`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.book(bookId) });
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.items(bookId) });
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.summary(bookId) });
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.budgetStatus(bookId) });
    },
  });

  return {
    reseedLabelsAsync: mutation.mutateAsync,
    isReseeding: mutation.isPending,
  };
}
