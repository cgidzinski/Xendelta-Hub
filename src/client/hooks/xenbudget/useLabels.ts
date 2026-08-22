import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook } from "./types";

export interface LabelInput {
    name?: string;
    color?: string;
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
