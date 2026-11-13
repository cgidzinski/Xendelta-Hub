import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { ShoppingLine } from "@shared/xenkitchen/shopping";

// The XenKitchen meal plan: recipes planned for days in a book, and the shopping list made from them.

export interface PlanEntry {
  _id: string;
  /** A calendar day, "2026-03-04". */
  date: string;
  item_id: string;
  title: string;
  /** How many the meal is for; null = as the recipe is written. */
  servings: number | null;
  recipe_servings: number | null;
}

export interface ShoppingListResult {
  from: string;
  to: string;
  meals: number;
  lines: ShoppingLine[];
}

const planKeys = {
  all: ["xenkitchen", "plan"] as const,
  range: (bookId: string, from: string, to: string) => [...planKeys.all, bookId, from, to] as const,
};

/** The meals planned in a book between two days (inclusive). */
export const usePlan = (bookId: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: planKeys.range(bookId ?? "", from, to),
    queryFn: async () =>
      (await api.get<{ entries: PlanEntry[] }>(`/api/xenkitchen/books/${bookId}/plan`, { params: { from, to } }))
        .entries,
    enabled: !!bookId,
  });

/** Every plan mutation refetches the plan: the server decides what is still valid (a deleted recipe drops out). */
function usePlanMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: planKeys.all }) });
}

export const useAddPlanEntry = () =>
  usePlanMutation((v: { bookId: string; date: string; item_id: string; servings?: number | null }) =>
    api.post(`/api/xenkitchen/books/${v.bookId}/plan`, { date: v.date, item_id: v.item_id, servings: v.servings }),
  );

export const useUpdatePlanEntry = () =>
  usePlanMutation((v: { id: string; date?: string; servings?: number | null }) =>
    api.put(`/api/xenkitchen/plan/${v.id}`, { date: v.date, servings: v.servings }),
  );

export const useRemovePlanEntry = () => usePlanMutation((id: string) => api.delete(`/api/xenkitchen/plan/${id}`));

/** Make the shopping list for the meals planned between two days. Nothing is saved on the server. */
export const useShoppingList = () =>
  useMutation({
    mutationFn: (v: { bookId: string; from: string; to: string }) =>
      api.post<ShoppingListResult>(`/api/xenkitchen/books/${v.bookId}/plan/shopping-list`, { from: v.from, to: v.to }),
  });
