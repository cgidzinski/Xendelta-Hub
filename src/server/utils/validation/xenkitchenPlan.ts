import { z } from "zod";
import { objectIdSchema } from "./core";

// The XenKitchen meal plan. Dates are calendar days ("2026-03-04"); a range is at most about two months.
export const PLAN_MAX_DAYS = 62;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-04")
  .refine(
    (v) =>
      !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
    "Not a real date",
  );

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const range = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, "The end can't be before the start")
  .refine((r) => dayCount(r.from, r.to) <= PLAN_MAX_DAYS, `A range is at most ${PLAN_MAX_DAYS} days`);

const servings = z.number().min(0.25).max(1000);

export const xenKitchenPlanBookParamSchema = z.object({ bookId: objectIdSchema });
export const xenKitchenPlanEntryParamSchema = z.object({ entryId: objectIdSchema });
export const xenKitchenPlanRangeQuerySchema = range;
export const xenKitchenPlanShoppingSchema = range;
export const xenKitchenPlanCreateSchema = z.object({
  date: day,
  item_id: objectIdSchema,
  servings: servings.nullable().optional(),
});
export const xenKitchenPlanUpdateSchema = z
  .object({ date: day.optional(), servings: servings.nullable().optional() })
  .refine((v) => v.date !== undefined || v.servings !== undefined, "Nothing to change");
