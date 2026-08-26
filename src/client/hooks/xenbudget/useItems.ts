import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { invalidateItemDerived } from "./invalidate";
import type { XenBudgetItem, ItemsPage, CreateItemInput, UpdateItemInput } from "./types";

export interface ItemFilters {
    from?: string;
    to?: string;
    categories?: string[];
    flags?: string[];
    people?: string[];
    type?: "expense" | "income";
    /** Only items with a category classified need or want. */
    need_want?: "need" | "want";
    /** Items with no category at all — the worklist an import leaves behind. */
    uncategorised?: boolean;
    /** Review mode's queue: uncategorised only, minus "Ignored" and "Needs review". */
    review?: boolean;
    /** hidden (default, matches the totals) | only | all */
    excluded?: "hidden" | "only" | "all";
    /** Only items added manually or imported via CSV. */
    source?: "manual" | "csv";
    /** Only items imported under this saved mapping (preset id). */
    card?: string;
    q?: string;
    /**
     * One merchant, as the recurring and merchant analyses group them. Distinct from `q`:
     * the name is normalised, so the server turns it back into a pattern that tolerates
     * the punctuation and reference numbers normalisation dropped.
     */
    merchant?: string;
}

/**
 * Downloads the CURRENT view as CSV.
 *
 * The same filters, sent to the same endpoint with format=csv, so the file is exactly the
 * list on screen — the server applies them once and streams the whole result. Exporting
 * what the client happens to have loaded would quietly produce a partial file, since the
 * list is paginated.
 *
 * Uses the shared axios client rather than a plain link so the request carries the auth
 * header; a bare <a href> would hit the API unauthenticated.
 */
export async function exportItemsCsv(
    bookId: string, filters: ItemFilters, bookName: string,
): Promise<void> {
    const res = await apiClient.get(`/api/xenbudget/books/${bookId}/items`, {
        params: { ...toParams(filters), format: "csv" },
        responseType: "blob",
    });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xenbudget-${bookName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-items-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function toParams(filters: ItemFilters): Record<string, string> {
    const params: Record<string, string> = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.categories?.length) params.categories = filters.categories.join(",");
    if (filters.flags?.length) params.flags = filters.flags.join(",");
    if (filters.people?.length) params.people = filters.people.join(",");
    if (filters.type) params.type = filters.type;
    if (filters.need_want) params.need_want = filters.need_want;
    if (filters.uncategorised) params.uncategorised = "true";
    if (filters.review) params.review = "true";
    if (filters.excluded === "only") params.excluded = "true";
    else if (filters.excluded === "all") params.excluded = "all";
    if (filters.source) params.source = filters.source;
    if (filters.card) params.card = filters.card;
    if (filters.q) params.q = filters.q;
    if (filters.merchant) params.merchant = filters.merchant;
    return params;
}

/**
 * Item mutations, separate from the list query so the layout route can own "add item"
 * without also running an unfiltered copy of the list the items tab is already fetching.
 *
 * Anything that moves money invalidates the tallies as well as the list, so the Overview
 * and the item list can never disagree.
 */
export function useXenBudgetItemMutations(bookId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => invalidateItemDerived(queryClient, bookId);

    const createMutation = useMutation({
        mutationFn: async (input: CreateItemInput) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/items`, input);
            return res.data.data as XenBudgetItem;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ itemId, input }: { itemId: string; input: UpdateItemInput }) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}/items/${itemId}`, input);
            return res.data.data as XenBudgetItem;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (itemId: string) => {
            await apiClient.delete(`/api/xenbudget/books/${bookId}/items/${itemId}`);
        },
        onSuccess: invalidate,
    });

    const uploadImagesMutation = useMutation({
        mutationFn: async ({ itemId, files }: { itemId: string; files: File[] }) => {
            const formData = new FormData();
            files.forEach((f) => formData.append("images", f));
            await apiClient.post(`/api/xenbudget/books/${bookId}/items/${itemId}/images`, formData);
        },
        onSuccess: (_data, { itemId }) => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "item-image-urls", bookId, itemId] });
        },
    });

    const deleteImageMutation = useMutation({
        mutationFn: async ({ itemId, imageId }: { itemId: string; imageId: string }) => {
            await apiClient.delete(`/api/xenbudget/books/${bookId}/items/${itemId}/images/${imageId}`);
        },
        onSuccess: (_data, { itemId }) => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "item-image-urls", bookId, itemId] });
        },
    });

    return {
        createItemAsync: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
        updateItemAsync: updateMutation.mutateAsync,
        isUpdating: updateMutation.isPending,
        deleteItemAsync: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
        uploadItemImages: uploadImagesMutation.mutateAsync,
        isUploadingImages: uploadImagesMutation.isPending,
        deleteItemImage: deleteImageMutation.mutateAsync,
        isDeletingImage: deleteImageMutation.isPending,
    };
}

/** Signed display URLs for an item's images, fetched on demand (short-lived GCS URLs). */
export function useXenBudgetItemImageUrls(bookId: string, itemId: string | undefined, imageCount: number) {
    return useQuery<{ _id: string; signedUrl: string }[]>({
        queryKey: ["xenbudget", "item-image-urls", bookId, itemId],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/items/${itemId}/image-urls`);
            return res.data.data;
        },
        enabled: !!itemId && imageCount > 0,
        staleTime: 10 * 60 * 1000, // 10 min — signed URLs valid for 15 min
    });
}

/**
 * Items are filtered and paginated server-side rather than loaded whole and filtered in
 * a useMemo the way XenSplit does — a book fed by CSV imports is far too large for that.
 */
export function useXenBudgetItems(bookId: string, filters: ItemFilters = {}) {
    const query = useInfiniteQuery({
        queryKey: ["xenbudget", "items", bookId, filters],
        queryFn: async ({ pageParam }) => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/items`, {
                params: { ...toParams(filters), ...(pageParam ? { cursor: pageParam } : {}) },
            });
            return res.data.data as ItemsPage;
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.next_cursor ?? undefined,
        enabled: !!bookId,
        staleTime: 0,
    });

    return {
        items: query.data?.pages.flatMap((p) => p.items) ?? [],
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        hasMore: query.hasNextPage,
        loadMore: query.fetchNextPage,
        isLoadingMore: query.isFetchingNextPage,
    };
}
