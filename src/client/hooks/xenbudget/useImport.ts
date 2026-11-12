import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import { invalidateItemDerived } from "./invalidate";
import type {
  XenBudgetBook,
  ImportPreviewResult,
  DuplicateMatch,
  BulkImportResult,
  PresetInput,
  XenBudgetImportBatch,
} from "./types";

export interface BulkImportRequest {
  items: ImportCandidate[];
  /** Who these rows belong to. Empty means the importing user. */
  default_people?: string[];
  /** The import's mapping preset; its name is resolved for display when the import is read back. */
  preset_id?: string;
  filename?: string;
  /** "Skip auto-tagging" — import the rows without running the book's rules. */
  skip_rules?: boolean;
}

export interface ImportCandidate {
  type?: "expense" | "income";
  amount: number;
  currency?: string;
  date?: string;
  description: string;
  /** The bank's memo column, stored on the item as notes. */
  notes?: string;
  categories?: string[];
  people?: string[];
}

/** What has been imported into this book, newest first. */
export function useXenBudgetImports(bookId: string) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["xenbudget", "imports", bookId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/xenbudget/books/${bookId}/imports`);
      return (res.data.data as { imports: XenBudgetImportBatch[] }).imports;
    },
    enabled: !!bookId,
  });
  return { imports: data ?? [], isLoading, isError, error };
}

export function useXenBudgetImport(bookId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    invalidateItemDerived(queryClient, bookId);
    // An import also adds a batch to the history list, which nothing else touches.
    queryClient.invalidateQueries({ queryKey: ["xenbudget", "imports", bookId] });
  };

  // The preview runs the rules on the server, so what the wizard shows is produced by
  // exactly the same code that the import will run. It writes nothing.
  const previewMutation = useMutation({
    mutationFn: async ({ items, skip_rules }: { items: ImportCandidate[]; skip_rules?: boolean }) => {
      return api.post<ImportPreviewResult>(`/api/xenbudget/books/${bookId}/items/preview`, { items, skip_rules });
    },
  });

  const duplicatesMutation = useMutation({
    mutationFn: async (items: { amount: number; date?: string; description: string }[]) => {
      const res = await apiClient.post(`/api/xenbudget/books/${bookId}/items/check-duplicates`, { items });
      return (res.data.data as { duplicates: DuplicateMatch[] }).duplicates;
    },
  });

  const importMutation = useMutation({
    mutationFn: async (request: BulkImportRequest) => {
      return api.post<BulkImportResult>(`/api/xenbudget/books/${bookId}/items/bulk`, request);
    },
    onSuccess: invalidate,
  });

  const undoMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return api.delete<{ deleted: number }>(`/api/xenbudget/books/${bookId}/imports/${batchId}`);
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["xenbudget", "imports", bookId] });
    },
  });

  const savePresetMutation = useMutation({
    mutationFn: async (input: PresetInput) => {
      const res = await apiClient.post(`/api/xenbudget/books/${bookId}/import-presets`, input);
      return { presetId: res.data.preset_id as string, book: res.data.data as XenBudgetBook };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] }),
  });

  const updatePresetMutation = useMutation({
    mutationFn: async ({ presetId, input }: { presetId: string; input: PresetInput }) => {
      return api.put<XenBudgetBook>(`/api/xenbudget/books/${bookId}/import-presets/${presetId}`, input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] }),
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      return api.delete<XenBudgetBook>(`/api/xenbudget/books/${bookId}/import-presets/${presetId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] }),
  });

  return {
    previewAsync: previewMutation.mutateAsync,
    isPreviewing: previewMutation.isPending,
    checkDuplicatesAsync: duplicatesMutation.mutateAsync,
    importAsync: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    undoImportAsync: undoMutation.mutateAsync,
    isUndoing: undoMutation.isPending,
    savePresetAsync: savePresetMutation.mutateAsync,
    updatePresetAsync: updatePresetMutation.mutateAsync,
    deletePresetAsync: deletePresetMutation.mutateAsync,
  };
}
