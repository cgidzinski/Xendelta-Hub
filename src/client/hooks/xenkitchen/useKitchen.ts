import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { filtersToParams, type CookMethod, type KitchenFilters, type KitchenLayout } from "@shared/xenkitchen/kitchen";
import type { Cosmetics } from "@shared/cosmetics";

export type BookRole = "owner" | "editor" | "viewer";

export interface KitchenBookMember {
  user_id: string;
  role: BookRole;
  username: string;
  avatar: string | null;
  cosmetics?: Cosmetics;
}

export interface KitchenBook {
  _id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  my_role: BookRole;
  item_count: number;
  members: KitchenBookMember[];
  share: { enabled: boolean; token: string | null };
}

/** "all" means every book I'm in. */
export type BookScope = string;

export interface KitchenCategory {
  _id: string;
  book_id: string;
  name: string;
  icon: string;
  color: string;
  layout: KitchenLayout;
  order: number;
  count: number;
}

export interface KitchenImage {
  _id: string;
  url: string;
}

export interface KitchenIngredient {
  _id?: string;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  section: string;
}

export interface KitchenStep {
  _id?: string;
  text: string;
  timer_minutes: number | null;
}

export interface KitchenMethod {
  _id?: string;
  method: CookMethod;
  temp: number | null;
  temp_unit: "F" | "C";
  power: string;
  minutes_min: number | null;
  minutes_max: number | null;
  preheat: boolean;
  steps: string[];
}

export interface KitchenItem {
  _id: string;
  title: string;
  description: string;
  category: { _id: string; name: string; color: string; icon: string; layout: KitchenLayout } | null;
  category_id?: string | null;
  book_id?: string;
  book?: { _id: string; name: string } | null;
  my_role?: BookRole | null;
  created_by?: string | null;
  updated_by?: string | null;
  layout: KitchenLayout;
  tags: string[];
  favorite?: boolean;
  notes: string;
  images: KitchenImage[];
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: KitchenIngredient[];
  steps: KitchenStep[];
  brand: string;
  methods: KitchenMethod[];
  storage_note: string;
  /** The web address the recipe was imported from, or "". */
  source_url: string;
  share?: { enabled: boolean; token: string | null };
  created_at: string;
  updated_at: string;
}

export type KitchenItemInput = Partial<
  Omit<
    KitchenItem,
    | "_id"
    | "category"
    | "layout"
    | "images"
    | "share"
    | "created_at"
    | "updated_at"
    | "book"
    | "my_role"
    | "created_by"
    | "updated_by"
    | "favorite"
  >
> & {
  image_order?: string[];
};

export interface IngredientSuggestion {
  name: string;
  unit: string;
  count: number;
}

export const kitchenKeys = {
  all: ["xenkitchen"] as const,
  books: () => [...kitchenKeys.all, "books"] as const,
  categories: (book: BookScope) => [...kitchenKeys.all, "categories", book] as const,
  items: (params: string) => [...kitchenKeys.all, "items", params] as const,
  item: (id: string) => [...kitchenKeys.all, "item", id] as const,
  suggest: (q: string) => [...kitchenKeys.all, "suggest", q] as const,
  tags: () => [...kitchenKeys.all, "tags"] as const,
  public: (token: string) => ["xenkitchen-public", token] as const,
  publicBook: (token: string) => ["xenkitchen-public-book", token] as const,
  publicBookItem: (token: string, id: string) => ["xenkitchen-public-book", token, id] as const,
};

const base = "/api/xenkitchen";

/**
 * Unwraps `{ status, data }`. A response without `data` means something other than the
 * XenKitchen API answered — typically the web page, while a deploy is still restarting the
 * server — so say that instead of failing later with "data is undefined".
 */
function unwrap<T>(res: { data: ApiResponse<T> | string }): T {
  const body = res.data;
  if (!body || typeof body !== "object" || body.data === undefined) {
    throw new Error("XenKitchen couldn't reach its server just now. Refresh in a moment.");
  }
  return body.data;
}

export function useKitchenBooks() {
  const { data, isLoading } = useQuery({
    queryKey: kitchenKeys.books(),
    queryFn: async () => unwrap(await apiClient.get<ApiResponse<{ books: KitchenBook[] }>>(`${base}/books`)).books,
  });
  return { books: data ?? [], isLoading };
}

export function useKitchenCategories(book: BookScope = "all") {
  const { data, isLoading } = useQuery({
    queryKey: kitchenKeys.categories(book),
    queryFn: async () =>
      unwrap(
        await apiClient.get<ApiResponse<{ categories: KitchenCategory[]; total: number; uncategorised: number }>>(
          `${base}/categories`,
          { params: { book } },
        ),
      ),
    placeholderData: keepPreviousData,
  });
  return {
    categories: data?.categories ?? [],
    total: data?.total ?? 0,
    uncategorised: data?.uncategorised ?? 0,
    isLoading,
  };
}

export function useKitchenItems(filters: KitchenFilters, book: BookScope = "all") {
  const p = filtersToParams(filters);
  p.set("book", book);
  const params = p.toString();
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.items(params),
    queryFn: async () =>
      unwrap(await apiClient.get<ApiResponse<{ items: KitchenItem[]; total: number }>>(`${base}/items?${params}`)),
    placeholderData: keepPreviousData,
  });
  return { items: data?.items ?? [], total: data?.total ?? 0, isLoading, isFetching, isError, error, refetch };
}

export function useKitchenItem(id: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.item(id ?? ""),
    queryFn: async () => unwrap(await apiClient.get<ApiResponse<{ item: KitchenItem }>>(`${base}/items/${id}`)).item,
    enabled: !!id,
  });
  return { item: data, isLoading, isError, error, refetch };
}

export function usePublicKitchenItem(token: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.public(token ?? ""),
    queryFn: async () =>
      unwrap(await apiClient.get<ApiResponse<{ item: KitchenItem; owner: string | null }>>(`${base}/public/${token}`)),
    enabled: !!token,
    retry: false,
  });
  return { item: data?.item, owner: data?.owner ?? null, isLoading, isError, error, refetch };
}

/** Debounces the query so typing an ingredient name doesn't fire a request per keystroke. */
export function useIngredientSuggestions(q: string, enabled = true) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: kitchenKeys.suggest(debounced.toLowerCase()),
    queryFn: async () =>
      unwrap(
        await apiClient.get<ApiResponse<{ suggestions: IngredientSuggestion[] }>>(`${base}/ingredients/suggest`, {
          params: { q: debounced },
        }),
      ).suggestions,
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  return { suggestions: data ?? [], isFetching };
}

export function useKitchenTags() {
  const { data } = useQuery({
    queryKey: kitchenKeys.tags(),
    queryFn: async () =>
      unwrap(await apiClient.get<ApiResponse<{ tags: Array<{ tag: string; count: number }> }>>(`${base}/tags`)).tags,
    staleTime: 60_000,
  });
  return { tags: data ?? [] };
}

// Mutations invalidate the whole kitchen: lists, counts, suggestions and tags all derive
// from items, and a personal collection is small enough to just refetch.
function useKitchenMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const item = (result as any)?.item as KitchenItem | undefined;
      if (item?._id) qc.setQueryData(kitchenKeys.item(item._id), item);
      return qc.invalidateQueries({ queryKey: kitchenKeys.all });
    },
  });
}

type ItemResult = { item: KitchenItem };
const itemData = (r: { data: ApiResponse<ItemResult> }) => unwrap(r);

export const useCreateKitchenItem = () =>
  useKitchenMutation(async (input: KitchenItemInput) => itemData(await apiClient.post(`${base}/items`, input)));

export const useUpdateKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; patch: KitchenItemInput }) =>
    itemData(await apiClient.put(`${base}/items/${v.id}`, v.patch)),
  );

/**
 * Deleting must not wait on the shared invalidation: that refetches the open item, which is now a 404 and
 * retries for several seconds, so the caller sat on a hung promise and never navigated away.
 */
export const useDeleteKitchenItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`${base}/items/${id}`)).data,
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: kitchenKeys.item(id) });
      void qc.invalidateQueries({ queryKey: kitchenKeys.all });
    },
  });
};

export const useDuplicateKitchenItem = () =>
  useKitchenMutation(async (id: string) => itemData(await apiClient.post(`${base}/items/${id}/duplicate`)));

export const useUploadKitchenImages = () =>
  useKitchenMutation(async (v: { id: string; files: File[] }) => {
    const form = new FormData();
    v.files.forEach((f) => form.append("images", f));
    return itemData(await apiClient.post(`${base}/items/${v.id}/images`, form));
  });

/** A recipe read from a web page (nothing is saved): what the editor is filled with for review. */
export interface ImportedKitchenRecipe {
  title: string;
  description: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: Array<{ quantity: string; unit: string; name: string; note: string; section: string }>;
  steps: Array<{ text: string; timer_minutes: null }>;
  tags: string[];
  source_url: string;
  /** The page's main photo; added to the item after it is saved. */
  image_url: string | null;
}

export const useImportKitchenRecipe = () =>
  useMutation({
    mutationFn: async (url: string) =>
      unwrap(await apiClient.post<ApiResponse<{ recipe: ImportedKitchenRecipe }>>(`${base}/import-url`, { url }))
        .recipe,
  });

/** Add a picture from a web address (the imported recipe's photo) to a saved item. */
export const useAddKitchenImageFromUrl = () =>
  useKitchenMutation(async (v: { id: string; url: string }) =>
    itemData(await apiClient.post(`${base}/items/${v.id}/images/from-url`, { url: v.url })),
  );

export const useDeleteKitchenImage = () =>
  useKitchenMutation(async (v: { id: string; imageId: string }) =>
    itemData(await apiClient.delete(`${base}/items/${v.id}/images/${v.imageId}`)),
  );

export const useShareKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; action: "enable" | "disable" | "rotate" }) => {
    const url = `${base}/items/${v.id}/share`;
    if (v.action === "disable") return itemData(await apiClient.delete(url));
    return itemData(await apiClient.post(v.action === "rotate" ? `${url}/rotate` : url));
  });

export const useBulkMoveKitchenItems = () =>
  useKitchenMutation(
    async (v: { ids: string[]; category_id: string | null }) =>
      (await apiClient.put(`${base}/items/bulk/category`, v)).data,
  );

export const useBulkDeleteKitchenItems = () =>
  useKitchenMutation(async (ids: string[]) => (await apiClient.post(`${base}/items/bulk/delete`, { ids })).data);

export const useClonePublicKitchenItem = () =>
  useKitchenMutation(async (v: { token: string; itemId?: string; book_id?: string }) =>
    itemData(
      await apiClient.post(
        v.itemId ? `${base}/public/book/${v.token}/items/${v.itemId}/clone` : `${base}/public/${v.token}/clone`,
        v.book_id ? { book_id: v.book_id } : {},
      ),
    ),
  );

export interface PublicBook {
  book: { name: string; description: string; color: string; icon: string };
  categories: Array<Pick<KitchenCategory, "_id" | "name" | "icon" | "color" | "layout">>;
  items: KitchenItem[];
}

export function usePublicKitchenBook(token: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.publicBook(token ?? ""),
    queryFn: async () => unwrap(await apiClient.get<ApiResponse<PublicBook>>(`${base}/public/book/${token}`)),
    enabled: !!token,
    retry: false,
  });
  return { data, isLoading, isError, error, refetch };
}

export function usePublicKitchenBookItem(token: string | undefined, itemId: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.publicBookItem(token ?? "", itemId ?? ""),
    queryFn: async () =>
      unwrap(
        await apiClient.get<ApiResponse<{ item: KitchenItem; book: { name: string } }>>(
          `${base}/public/book/${token}/items/${itemId}`,
        ),
      ),
    enabled: !!token && !!itemId,
    retry: false,
  });
  return { item: data?.item, bookName: data?.book.name ?? null, isLoading, isError, error, refetch };
}

export const useToggleKitchenFavorite = () =>
  useKitchenMutation(async (v: { id: string; on: boolean }) =>
    itemData(
      await (v.on
        ? apiClient.post(`${base}/items/${v.id}/favorite`)
        : apiClient.delete(`${base}/items/${v.id}/favorite`)),
    ),
  );

export const useMoveKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; book_id: string }) =>
    itemData(await apiClient.put(`${base}/items/${v.id}/move`, { book_id: v.book_id })),
  );

export const useCopyKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; book_id: string }) =>
    itemData(await apiClient.post(`${base}/items/${v.id}/copy`, { book_id: v.book_id })),
  );

type BookResult = { book: KitchenBook };
const bookData = (r: { data: ApiResponse<BookResult> }) => unwrap(r);

export const useCreateKitchenBook = () =>
  useKitchenMutation(async (v: { name: string; icon?: string; color?: string; description?: string }) =>
    bookData(await apiClient.post(`${base}/books`, v)),
  );

export const useUpdateKitchenBook = () =>
  useKitchenMutation(
    async (v: { id: string; patch: Partial<Pick<KitchenBook, "name" | "icon" | "color" | "description">> }) =>
      bookData(await apiClient.put(`${base}/books/${v.id}`, v.patch)),
  );

export const useDeleteKitchenBook = () =>
  useKitchenMutation(async (id: string) => (await apiClient.delete(`${base}/books/${id}`)).data);

export const useAddKitchenBookMembers = () =>
  useKitchenMutation(async (v: { id: string; userIds: string[]; role: "editor" | "viewer" }) =>
    bookData(await apiClient.post(`${base}/books/${v.id}/members`, { userIds: v.userIds, role: v.role })),
  );

export const useSetKitchenBookRole = () =>
  useKitchenMutation(async (v: { id: string; userId: string; role: BookRole }) =>
    bookData(await apiClient.put(`${base}/books/${v.id}/members/${v.userId}`, { role: v.role })),
  );

export const useRemoveKitchenBookMember = () =>
  useKitchenMutation(
    async (v: { id: string; userId: string }) =>
      (await apiClient.delete(`${base}/books/${v.id}/members/${v.userId}`)).data,
  );

export const useShareKitchenBook = () =>
  useKitchenMutation(async (v: { id: string; action: "enable" | "disable" | "rotate" }) => {
    const url = `${base}/books/${v.id}/share`;
    if (v.action === "disable") return bookData(await apiClient.delete(url));
    return bookData(await apiClient.post(v.action === "rotate" ? `${url}/rotate` : url));
  });

export const bookShareUrlFor = (token: string) => `${window.location.origin}/k/b/${token}`;

export const canEditBook = (role: BookRole | null | undefined) => role === "owner" || role === "editor";

export const useCreateKitchenCategory = () =>
  useKitchenMutation(
    async (v: { book_id: string; name: string; icon?: string; color?: string; layout?: KitchenLayout }) =>
      (await apiClient.post(`${base}/categories`, v)).data,
  );

export const useUpdateKitchenCategory = () =>
  useKitchenMutation(
    async (v: { id: string; patch: Partial<Pick<KitchenCategory, "name" | "icon" | "color" | "layout">> }) =>
      (await apiClient.put(`${base}/categories/${v.id}`, v.patch)).data,
  );

export const useDeleteKitchenCategory = () =>
  useKitchenMutation(async (id: string) => (await apiClient.delete(`${base}/categories/${id}`)).data);

export const useReorderKitchenCategories = () =>
  useKitchenMutation(
    async (v: { book_id: string; ids: string[] }) => (await apiClient.put(`${base}/categories/order`, v)).data,
  );

export const shareUrlFor = (token: string) => `${window.location.origin}/k/${token}`;
