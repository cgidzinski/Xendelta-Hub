import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
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
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "items", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "summary", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
    };

    const base = `/api/xenbudget/books/${bookId}/${kind}`;

    const createMutation = useMutation({
        mutationFn: async (input: LabelInput) => {
            const res = await apiClient.post(base, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ labelId, input }: { labelId: string; input: LabelInput }) => {
            const res = await apiClient.put(`${base}/${labelId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (labelId: string) => {
            const res = await apiClient.delete(`${base}/${labelId}`);
            return res.data.data as XenBudgetBook;
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

export const useXenBudgetCategories = (bookId: string) => useXenBudgetLabels(bookId, "categories");
export const useXenBudgetFlags = (bookId: string) => useXenBudgetLabels(bookId, "flags");

/**
 * How many items currently carry each category, keyed by name — for the count shown next
 * to a chip in Settings > Categories, and to decide whether deleting one needs a
 * confirmation. Not part of `useXenBudgetLabels`'s invalidation set: it's a display-only
 * figure that refetches whenever the Categories settings page is opened, rather than being
 * wired into every item mutation's invalidation list.
 */
export function useXenBudgetCategoryItemCounts(bookId: string) {
    const query = useQuery({
        queryKey: ["xenbudget", "category-item-counts", bookId],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/categories/counts`);
            return res.data.data as Record<string, number>;
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
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/reseed-labels`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "items", bookId] });
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "summary", bookId] });
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
        },
    });

    return {
        reseedLabelsAsync: mutation.mutateAsync,
        isReseeding: mutation.isPending,
    };
}
