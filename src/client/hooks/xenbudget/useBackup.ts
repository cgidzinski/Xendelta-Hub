import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";

export interface RestoreResult {
    mode?: "merge" | "replace";
    restored: number;
    removed?: number;
    skipped_duplicates?: number;
    unmatched_people: string[];
    book?: { _id: string };
}

export function useXenBudgetBackup(bookId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["xenbudget"] });
    };

    /**
     * Downloads the book as JSON. Uses the raw response rather than a plain link so the
     * request carries the auth header the shared axios client attaches — a bare <a href>
     * would hit the API unauthenticated.
     */
    const exportBook = async (bookName: string) => {
        const res = await apiClient.get(`/api/xenbudget/books/${bookId}/export`, { responseType: "blob" });
        const url = URL.createObjectURL(res.data as Blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `xenbudget-${bookName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const restoreHereMutation = useMutation({
        mutationFn: async ({ payload, mode }: { payload: unknown; mode: "merge" | "replace" }) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/import`, { ...(payload as object), mode });
            return res.data.data as RestoreResult;
        },
        onSuccess: invalidate,
    });

    const restoreAsNewMutation = useMutation({
        mutationFn: async (payload: unknown) => {
            const res = await apiClient.post(`/api/xenbudget/books/import`, payload);
            return res.data.data as RestoreResult;
        },
        onSuccess: invalidate,
    });

    return {
        exportBook,
        restoreHereAsync: restoreHereMutation.mutateAsync,
        isRestoringHere: restoreHereMutation.isPending,
        restoreAsNewAsync: restoreAsNewMutation.mutateAsync,
        isRestoringAsNew: restoreAsNewMutation.isPending,
    };
}
