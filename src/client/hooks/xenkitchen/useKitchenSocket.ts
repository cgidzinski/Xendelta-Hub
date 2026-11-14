import { kitchenKeys } from "./useKitchen";
import { useSocketInvalidate } from "../useSocketEvent";

/**
 * Keeps an open kitchen live. The server pushes after every change another member makes — a recipe saved or deleted,
 * a category renamed, a meal planned, a photo added — and the whole kitchen is small enough to just refetch.
 *
 * `kitchenKeys.all` sits above the books, categories, items and meal plan, so one invalidation reaches all of them,
 * including the caller's other tabs.
 */
export function useKitchenSocket() {
  useSocketInvalidate("xenkitchen:book_update", [kitchenKeys.all]);
  useSocketInvalidate("xenkitchen:books_updated", [kitchenKeys.all]);
}
