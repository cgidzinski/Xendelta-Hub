import { xenbudgetKeys } from "./keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";

export type RestoreScope = "items" | "config" | "everything";

export interface RestoreResult {
  scope?: RestoreScope;
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
    queryClient.invalidateQueries({ queryKey: xenbudgetKeys.all });
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
    mutationFn: async ({ payload, scope }: { payload: unknown; scope: RestoreScope }) => {
      return api.post<RestoreResult>(`/api/xenbudget/books/${bookId}/import`, { ...(payload as object), scope });
    },
    onSuccess: invalidate,
  });

  const restoreAsNewMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return api.post<RestoreResult>(`/api/xenbudget/books/import`, payload);
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
