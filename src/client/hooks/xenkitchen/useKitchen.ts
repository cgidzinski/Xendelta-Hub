import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import {
  filtersToParams,
  type CookMethod,
  type KitchenFilters,
  type KitchenLayout,
} from "../../../shared/xenkitchen/kitchen";

export interface KitchenCategory {
  _id: string;
  name: string;
  icon: string;
  color: string;
  layout: KitchenLayout;
  order: number;
  count: number;
}

export interface KitchenImage { _id: string; url: string }

export interface KitchenIngredient {
  _id?: string;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  section: string;
}

export interface KitchenStep { _id?: string; text: string; timer_minutes: number | null }

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
  share?: { enabled: boolean; token: string | null };
  created_at: string;
  updated_at: string;
}

export type KitchenItemInput = Partial<Omit<KitchenItem, "_id" | "category" | "layout" | "images" | "share" | "created_at" | "updated_at">> & {
  image_order?: string[];
};

export interface IngredientSuggestion { name: string; unit: string; count: number }

export const kitchenKeys = {
  all: ["xenkitchen"] as const,
  categories: () => [...kitchenKeys.all, "categories"] as const,
  items: (params: string) => [...kitchenKeys.all, "items", params] as const,
  item: (id: string) => [...kitchenKeys.all, "item", id] as const,
  suggest: (q: string) => [...kitchenKeys.all, "suggest", q] as const,
  tags: () => [...kitchenKeys.all, "tags"] as const,
  public: (token: string) => ["xenkitchen-public", token] as const,
};

const base = "/api/xenkitchen";

export function useKitchenCategories() {
  const { data, isLoading } = useQuery({
    queryKey: kitchenKeys.categories(),
    queryFn: async () =>
      (await apiClient.get<ApiResponse<{ categories: KitchenCategory[]; total: number; uncategorised: number }>>(`${base}/categories`)).data.data!,
  });
  return {
    categories: data?.categories ?? [],
    total: data?.total ?? 0,
    uncategorised: data?.uncategorised ?? 0,
    isLoading,
  };
}

export function useKitchenItems(filters: KitchenFilters) {
  const params = filtersToParams(filters).toString();
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.items(params),
    queryFn: async () =>
      (await apiClient.get<ApiResponse<{ items: KitchenItem[]; total: number }>>(`${base}/items?${params}`)).data.data!,
    placeholderData: keepPreviousData,
  });
  return { items: data?.items ?? [], total: data?.total ?? 0, isLoading, isFetching, isError, error, refetch };
}

export function useKitchenItem(id: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.item(id ?? ""),
    queryFn: async () => (await apiClient.get<ApiResponse<{ item: KitchenItem }>>(`${base}/items/${id}`)).data.data!.item,
    enabled: !!id,
  });
  return { item: data, isLoading, isError, error, refetch };
}

export function usePublicKitchenItem(token: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: kitchenKeys.public(token ?? ""),
    queryFn: async () =>
      (await apiClient.get<ApiResponse<{ item: KitchenItem; owner: string | null }>>(`${base}/public/${token}`)).data.data!,
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
      (await apiClient.get<ApiResponse<{ suggestions: IngredientSuggestion[] }>>(`${base}/ingredients/suggest`, { params: { q: debounced } })).data.data!.suggestions,
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
      (await apiClient.get<ApiResponse<{ tags: Array<{ tag: string; count: number }> }>>(`${base}/tags`)).data.data!.tags,
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
const itemData = (r: { data: ApiResponse<ItemResult> }) => r.data.data!;

export const useCreateKitchenItem = () =>
  useKitchenMutation(async (input: KitchenItemInput) => itemData(await apiClient.post(`${base}/items`, input)));

export const useUpdateKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; patch: KitchenItemInput }) =>
    itemData(await apiClient.put(`${base}/items/${v.id}`, v.patch)));

export const useDeleteKitchenItem = () =>
  useKitchenMutation(async (id: string) => (await apiClient.delete(`${base}/items/${id}`)).data);

export const useDuplicateKitchenItem = () =>
  useKitchenMutation(async (id: string) => itemData(await apiClient.post(`${base}/items/${id}/duplicate`)));

export const useUploadKitchenImages = () =>
  useKitchenMutation(async (v: { id: string; files: File[] }) => {
    const form = new FormData();
    v.files.forEach((f) => form.append("images", f));
    return itemData(await apiClient.post(`${base}/items/${v.id}/images`, form));
  });

export const useDeleteKitchenImage = () =>
  useKitchenMutation(async (v: { id: string; imageId: string }) =>
    itemData(await apiClient.delete(`${base}/items/${v.id}/images/${v.imageId}`)));

export const useShareKitchenItem = () =>
  useKitchenMutation(async (v: { id: string; action: "enable" | "disable" | "rotate" }) => {
    const url = `${base}/items/${v.id}/share`;
    if (v.action === "disable") return itemData(await apiClient.delete(url));
    return itemData(await apiClient.post(v.action === "rotate" ? `${url}/rotate` : url));
  });

export const useBulkMoveKitchenItems = () =>
  useKitchenMutation(async (v: { ids: string[]; category_id: string | null }) =>
    (await apiClient.put(`${base}/items/bulk/category`, v)).data);

export const useBulkDeleteKitchenItems = () =>
  useKitchenMutation(async (ids: string[]) => (await apiClient.post(`${base}/items/bulk/delete`, { ids })).data);

export const useClonePublicKitchenItem = () =>
  useKitchenMutation(async (token: string) => itemData(await apiClient.post(`${base}/public/${token}/clone`)));

export const useCreateKitchenCategory = () =>
  useKitchenMutation(async (v: { name: string; icon?: string; color?: string; layout?: KitchenLayout }) =>
    (await apiClient.post(`${base}/categories`, v)).data);

export const useUpdateKitchenCategory = () =>
  useKitchenMutation(async (v: { id: string; patch: Partial<Pick<KitchenCategory, "name" | "icon" | "color" | "layout">> }) =>
    (await apiClient.put(`${base}/categories/${v.id}`, v.patch)).data);

export const useDeleteKitchenCategory = () =>
  useKitchenMutation(async (id: string) => (await apiClient.delete(`${base}/categories/${id}`)).data);

export const useReorderKitchenCategories = () =>
  useKitchenMutation(async (ids: string[]) => (await apiClient.put(`${base}/categories/order`, { ids })).data);

export const shareUrlFor = (token: string) => `${window.location.origin}/k/${token}`;
