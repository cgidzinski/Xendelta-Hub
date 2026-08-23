import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type {
    XenBudgetBook, ImportPreviewResult, DuplicateMatch, BulkImportResult, PresetInput,
    XenBudgetImportBatch,
} from "./types";

export interface BulkImportRequest {
    items: ImportCandidate[];
    /** Who these rows belong to. Empty means the importing user. */
    default_people?: string[];
    /** Which card this came from, so the import can be found again later. */
    source_label?: string;
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
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "items", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "summary", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "imports", bookId] });
    };

    // The preview runs the rules on the server, so what the wizard shows is produced by
    // exactly the same code that the import will run. It writes nothing.
    const previewMutation = useMutation({
        mutationFn: async ({ items, skip_rules }: { items: ImportCandidate[]; skip_rules?: boolean }) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/items/preview`, { items, skip_rules });
            return res.data.data as ImportPreviewResult;
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
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/items/bulk`, request);
            return res.data.data as BulkImportResult;
        },
        onSuccess: invalidate,
    });

    const undoMutation = useMutation({
        mutationFn: async (batchId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/imports/${batchId}`);
            return res.data.data as { deleted: number };
        },
        onSuccess: () => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "imports", bookId] });
        },
    });

    const savePresetMutation = useMutation({
        mutationFn: async (input: PresetInput) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/import-presets`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] }),
    });

    const updatePresetMutation = useMutation({
        mutationFn: async ({ presetId, input }: { presetId: string; input: PresetInput }) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}/import-presets/${presetId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] }),
    });

    const deletePresetMutation = useMutation({
        mutationFn: async (presetId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/import-presets/${presetId}`);
            return res.data.data as XenBudgetBook;
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
