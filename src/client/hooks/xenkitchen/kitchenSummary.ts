import {
  COOK_METHOD_LABELS,
  formatMinuteRange,
  formatMinutes,
  totalMinutes,
} from "@shared/xenkitchen/kitchen";
import type { KitchenItem, KitchenMethod } from "./useKitchen";

export function methodHeadline(m: KitchenMethod): string {
  const parts = [COOK_METHOD_LABELS[m.method]];
  if (m.temp) parts.push(`${m.temp}°${m.temp_unit}`);
  else if (m.power) parts.push(m.power);
  const time = formatMinuteRange(m.minutes_min, m.minutes_max);
  if (time) parts.push(time);
  return parts.join(" · ");
}

/** One line under a card's title: "Serves 4 · 45 min" or "Oven 425°F · 18–20 min". */
export function itemSummary(item: KitchenItem): string {
  if (item.layout === "instructions") {
    if (item.methods.length === 0) return item.brand || "";
    const first = methodHeadline(item.methods[0]);
    return item.methods.length > 1 ? `${first} +${item.methods.length - 1}` : first;
  }
  const parts: string[] = [];
  if (item.servings) parts.push(`Serves ${item.servings}`);
  const t = formatMinutes(totalMinutes(item, "recipe"));
  if (t) parts.push(t);
  if (!parts.length && item.ingredients.length) parts.push(`${item.ingredients.length} ingredient${item.ingredients.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
