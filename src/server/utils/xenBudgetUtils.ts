import crypto from "crypto";
import { resolveSplits } from "./xenSplitUtils";

export type ShareType = "equal" | "exact" | "percent";
export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface Share {
  user_id: string;
  amount: number;
  percentage?: number;
}

export interface CategoryWeight {
  name: string;
  amount: number;
  percentage?: number;
}

export interface BudgetLike {
  period: BudgetPeriod;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
}

export interface PeriodRange {
  from: Date;
  to: Date;  // exclusive
}

// --- Weighted splitting -----------------------------------------------------

interface WeightedPart {
  key: string;
  amount?: number;
  percentage?: number;
}

/** What comes back out: settleToCents guarantees every part has a resolved amount. */
export interface ResolvedPart {
  key: string;
  amount: number;
  percentage?: number;
}

/**
 * Rounds every part to cents and puts the whole residual on the last one, so the parts
 * sum to exactly `amount`.
 *
 * This pass is why resolveSplits' output isn't used directly: its "equal" branch returns
 * the raw quotient (10/3 -> 3.3333333333333335 three times), which is correct for
 * XenSplit's balance netting but leaves sub-cent dust in XenBudget, where the parts are
 * summed independently by an aggregation and are expected to reconcile with the item
 * total to the penny.
 */
function settleToCents<T extends { amount: number }>(parts: T[], amount: number): T[] {
  if (parts.length === 0) return parts;
  const rounded = parts.map((p) => ({ ...p, amount: roundMoney(p.amount || 0) }));
  const residual = roundMoney(amount - rounded.reduce((acc, p) => acc + p.amount, 0));
  if (residual !== 0) {
    const last = rounded[rounded.length - 1];
    last.amount = roundMoney(last.amount + residual);
  }
  return rounded;
}

/**
 * Divides `amount` across `parts` by even split, exact amounts or percentages.
 *
 * Key-agnostic on purpose: owners and categories are the same problem, so they share one
 * implementation and one set of rounding tests rather than drifting apart. The split-type
 * semantics come from XenSplit's resolveSplits; this adds the cent-settling pass.
 */
export function resolveWeighted(
  splitType: ShareType,
  amount: number,
  parts: WeightedPart[],
  allKeys: string[],
): ResolvedPart[] {
  const asSplits = parts.map((p) => ({
    user_id: p.key,
    amount_owed: p.amount,
    percentage: p.percentage,
  }));
  const resolved = resolveSplits(splitType, amount, asSplits, allKeys).map((s) => ({
    key: s.user_id,
    amount: s.amount_owed ?? 0,
    percentage: s.percentage,
  }));
  return settleToCents(resolved, amount);
}

/** Per-person shares. Falls back to an even split across everyone when nobody is named. */
export function resolveShares(
  shareType: ShareType,
  amount: number,
  shares: { user_id: string; amount?: number; percentage?: number }[],
  allMemberIds: string[],
): Share[] {
  return resolveWeighted(
    shareType,
    amount,
    shares.map((s) => ({ key: s.user_id, amount: s.amount, percentage: s.percentage })),
    allMemberIds,
  ).map((p) => ({ user_id: p.key, amount: p.amount, percentage: p.percentage }));
}

/**
 * Per-category weights. Unlike shares there is no sensible fallback set — an item nobody
 * categorised is uncategorised, not spread across every category in the book — so an
 * empty input returns empty.
 */
export function resolveCategories(
  splitType: ShareType,
  amount: number,
  categories: { name: string; amount?: number; percentage?: number }[],
): CategoryWeight[] {
  if (!categories || categories.length === 0) return [];
  return resolveWeighted(
    splitType,
    amount,
    categories.map((c) => ({ key: c.name, amount: c.amount, percentage: c.percentage })),
    [],
  ).map((p) => ({ name: p.key, amount: p.amount, percentage: p.percentage }));
}

// --- Budget periods ---------------------------------------------------------

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

function wallKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Day of week (0 = Sunday) for a pure calendar date.
function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseWallKey(key: string): { year: number; month: number; day: number } {
  return { year: +key.slice(0, 4), month: +key.slice(5, 7), day: +key.slice(8, 10) };
}

const MONTHS_PER_PERIOD: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

// The [from, to) window a budget is currently in, as UTC instants.
//
// Recurring periods always snap to the calendar boundary — the 1st of the month/quarter/
// year, Monday for weekly — rather than an anchor day, so a budget created on the 15th
// still runs calendar-month to calendar-month. All the arithmetic is done on wall-clock
// dates in `timeZone` and only converted to UTC at the edges - doing it on UTC instants
// shifts the boundary by the offset and misfiles anything spent near midnight.
export function budgetPeriodRange(
  budget: BudgetLike,
  asOf: Date,
): PeriodRange {
  if (budget.period === "custom") {
    const from = budget.start_date ? new Date(budget.start_date) : new Date(0);
    const to = budget.end_date ? new Date(budget.end_date) : new Date(8640000000000000);
    return { from, to };
  }

  const now = parseWallKey(asOf.toISOString().slice(0, 10));

  if (budget.period === "weekly") {
    // Monday-to-Monday, matching isoWeekKey's ISO-week convention below.
    const delta = (dayOfWeek(now.year, now.month, now.day) + 6) % 7; // Monday = 0
    const startMs = Date.UTC(now.year, now.month - 1, now.day) - delta * 86400000;
    const s = new Date(startMs);
    const e = new Date(startMs + 7 * 86400000);
    return {
      from: new Date(`${wallKey(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate())}T00:00:00.000Z`),
      to: new Date(`${wallKey(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate())}T00:00:00.000Z`),
    };
  }

  const step = MONTHS_PER_PERIOD[budget.period] ?? 1;
  const index = Math.floor((now.month - 1) / step) * step;
  const s = addMonths(now.year, 1, index);
  const e = addMonths(now.year, 1, index + step);
  return {
    from: new Date(`${wallKey(s.year, s.month, 1)}T00:00:00.000Z`),
    to: new Date(`${wallKey(e.year, e.month, 1)}T00:00:00.000Z`),
  };
}

/**
 * The last `count` of a budget's own periods, oldest first, ending with the one `asOf`
 * falls in.
 *
 * Nothing about a closed period is stored - budgets are recomputed on every request - so
 * a history strip has to be measured, and this is the set of windows to measure over. The
 * windows are the budget's OWN, never the range a caller asked for: "how did each month
 * go" is a question about months, and answering it over an arbitrary report range would
 * silently change what a column means.
 *
 * A one-off `custom` budget has no repeating window and so has no history; it returns
 * empty rather than inventing one. `count` at or below zero returns empty too, which is
 * what makes `?history=0` the free default on the wire.
 */
export function previousPeriodRanges(
  budget: BudgetLike,
  asOf: Date,
  count: number,
): PeriodRange[] {
  if (budget.period === "custom" || count <= 0) return [];

  const current = budgetPeriodRange(budget, asOf);

  if (budget.period === "weekly") {
    const week = 7 * 86400000;
    const ranges: PeriodRange[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const from = new Date(current.from.getTime() - i * week);
      ranges.push({ from, to: new Date(from.getTime() + week) });
    }
    return ranges;
  }

  // Month-aligned periods step by whole calendar months, not by a fixed number of days -
  // subtracting 30 days from March 1st lands in January and would misfile a whole month.
  const step = MONTHS_PER_PERIOD[budget.period] ?? 1;
  const start = parseWallKey(current.from.toISOString().slice(0, 10));
  const ranges: PeriodRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const f = addMonths(start.year, start.month, -i * step);
    const t = addMonths(f.year, f.month, step);
    ranges.push({
      from: new Date(`${wallKey(f.year, f.month, 1)}T00:00:00.000Z`),
      to: new Date(`${wallKey(t.year, t.month, 1)}T00:00:00.000Z`),
    });
  }
  return ranges;
}

// --- Period bucket seeding --------------------------------------------------

export type GroupBy = "day" | "week" | "month";

// ISO-8601 week key, matching Mongo's $dateToString "%G-W%V" exactly. The ISO year is
// the year of the week's Thursday, which is not always the calendar year of the date -
// 2027-01-01 is a Friday and belongs to week 2026-W53.
export function isoWeekKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (date.getUTCDay() + 6) % 7;  // Monday = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);  // the Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${week < 10 ? "0" + week : week}`;
}

// A range longer than this in the requested granularity is almost certainly a mistake,
// and seeding it would build a uselessly huge response.
const MAX_SEEDED_PERIODS = 3000;

// The ordered bucket keys covering [from, to] in `timeZone`, so a month with no spending
// still renders as a zero rather than vanishing from the chart.
//
// These keys MUST match what Mongo's $dateToString produces for the same grouping and
// timezone; if the two drift apart the buckets never join and every period reads empty.
export function seedPeriods(from: Date, to: Date, groupBy: GroupBy): string[] {
  const keys: string[] = [];
  if (to < from) return keys;

  const startKey = from.toISOString().slice(0, 10);
  const endKey = to.toISOString().slice(0, 10);
  let cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);

  while (cursor <= end && keys.length < MAX_SEEDED_PERIODS) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const key = groupBy === "day"
      ? `${y}-${pad(m)}-${pad(d)}`
      : groupBy === "week"
        ? isoWeekKey(y, m, d)
        : `${y}-${pad(m)}`;
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return keys;
}

// --- Import de-duplication --------------------------------------------------

// Bank exports are noisy about whitespace, case and internal padding, so normalize
// before hashing or the same transaction re-imported next month won't match itself.
export function normalizeDescription(description: string): string {
  return (description || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Identifies a transaction for duplicate detection. Deliberately NOT unique in the
// database: two identical $4 coffees on the same day are both real, so a match is
// surfaced to the user as "probably a duplicate" rather than enforced as a constraint.
export function computeImportHash(
  date: Date | string,
  amount: number,
  description: string,
): string {
  const day = new Date(date).toISOString().slice(0, 10);
  const payload = `${day}|${amount.toFixed(2)}|${normalizeDescription(description)}`;
  return crypto.createHash("sha1").update(payload).digest("hex");
}

// Round money to cents. Amounts are stored as floats in major units (the convention
// across this codebase), so anything derived from arithmetic needs pinning.
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
