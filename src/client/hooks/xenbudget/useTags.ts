import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook } from "./types";

export interface TagInput {
    name?: string;
    color?: string;
}

/**
 * Tag registry CRUD. Every mutation also invalidates the items and summaries: a rename
 * rewrites the tag on every item that carried it, and a delete strips it, so the lists
 * and tallies on screen are stale the moment either succeeds.
 */
export function useXenBudgetTags(bookId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "items", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "summary", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
    };

    const createMutation = useMutation({
        mutationFn: async (input: TagInput) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/tags`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ tagId, input }: { tagId: string; input: TagInput }) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}/tags/${tagId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (tagId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/tags/${tagId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    return {
        createTagAsync: createMutation.mutateAsync,
        isCreatingTag: createMutation.isPending,
        updateTagAsync: updateMutation.mutateAsync,
        isUpdatingTag: updateMutation.isPending,
        deleteTagAsync: deleteMutation.mutateAsync,
        isDeletingTag: deleteMutation.isPending,
    };
}
