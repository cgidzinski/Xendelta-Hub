import type { KitchenLayout } from "@shared/xenkitchen/kitchen";
import type { KitchenCategory } from "../../../../hooks/xenkitchen/useKitchen";

export interface CategoryOption {
  /** "" is All, "none" is Uncategorised, anything else is a category id. */
  id: string;
  label: string;
  count: number;
  /** Absent for All and Uncategorised. */
  color?: string;
}

interface Input {
  categories: KitchenCategory[];
  total: number;
  uncategorised: number;
  /** The Type filter, if one is set: it narrows what is offered. */
  layout: KitchenLayout | "";
}

/**
 * What the category picker offers, in order: All, the book's categories, Uncategorised. A Type filter keeps only that
 * type's categories, makes All count just them, and hides Uncategorised for instructions (those items always use the
 * recipe layout, so they count as recipes).
 */
export function categoryOptions({ categories, total, uncategorised, layout }: Input): CategoryOption[] {
  const visible = layout ? categories.filter((c) => c.layout === layout) : categories;
  const allCount = layout
    ? visible.reduce((n, c) => n + c.count, 0) + (layout === "recipe" ? uncategorised : 0)
    : total;
  return [
    { id: "", label: "All", count: allCount },
    ...visible.map((c) => ({ id: c._id, label: c.name, count: c.count, color: c.color })),
    ...(uncategorised > 0 && layout !== "instructions"
      ? [{ id: "none", label: "Uncategorised", count: uncategorised }]
      : []),
  ];
}
