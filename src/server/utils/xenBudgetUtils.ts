import crypto from "crypto";
import { resolveSplits } from "./xenSplitUtils";
import { tzDayKey, zonedWallToUtc } from "./statsRange";

export type ShareType = "equal" | "exact" | "percent";
export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface Share {
  user_id: string;
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

// --- Shares -----------------------------------------------------------------

// Rounds every share to cents and puts the whole residual on the last one, so the shares
// sum to exactly `amount`.
//
// This pass is why resolveSplits' output isn't used directly: its "equal" branch returns
// the raw quotient (10/3 -> 3.3333333333333335 three times), which is correct for
// XenSplit's balance netting but leaves sub-cent dust in XenBudget, where per-person
// shares are summed independently by an aggregation and are expected to reconcile with
// the book total to the penny.
function settleSharesToCents(shares: Share[], amount: number): Share[] {
  if (shares.length === 0) return shares;
  const rounded = shares.map((s) => ({ ...s, amount: roundMoney(s.amount || 0) }));
  const residual = roundMoney(amount - rounded.reduce((acc, s) => acc + s.amount, 0));
  if (residual !== 0) {
    const last = rounded[rounded.length - 1];
    last.amount = roundMoney(last.amount + residual);
  }
  return rounded;
}

// Resolves the per-person shares to store for an item. Delegates the split-type semantics
// to XenSplit's resolveSplits so that logic lives in one tested place, then pins the
// result to cents. Only the field name differs between the two: XenBudget calls it
// `amount` rather than `amount_owed`.
export function resolveShares(
  shareType: ShareType,
  amount: number,
  shares: { user_id: string; amount?: number; percentage?: number }[],
  allMemberIds: string[],
): Share[] {
  const asSplits = shares.map((s) => ({
    user_id: s.user_id,
    amount_owed: s.amount,
    percentage: s.percentage,
  }));
  const resolved = resolveSplits(shareType, amount, asSplits, allMemberIds).map((s) => ({
    user_id: s.user_id,
    amount: s.amount_owed,
    percentage: s.percentage,
  }));
  return settleSharesToCents(resolved, amount);
}

// --- Budget periods ---------------------------------------------------------

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

// Days in a 1-based (year, month), via UTC calendar arithmetic on a pure date.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// An anchor day of 31 has to mean "the 30th" in a 30-day month, and "the 28th" in
// February - otherwise a monthly budget anchored on the 31st has no period at all in
// most months.
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
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
// Periods are anchored on the budget's start_date, so a monthly budget starting on the
// 15th runs 15th-to-15th rather than snapping to calendar months. All the calendar
// arithmetic is done on wall-clock dates in `timeZone` and only converted to UTC at the
// edges - doing it on UTC instants shifts the boundary by the offset and misfiles
// anything spent near midnight.
export function budgetPeriodRange(
  budget: BudgetLike,
  asOf: Date,
  timeZone: string,
): PeriodRange {
  if (budget.period === "custom") {
    const from = budget.start_date ? new Date(budget.start_date) : new Date(0);
    const to = budget.end_date ? new Date(budget.end_date) : new Date(8640000000000000);
    return { from, to };
  }

  const now = parseWallKey(tzDayKey(asOf, timeZone));
  // With no explicit anchor, fall back to the 1st of the month (calendar periods).
  const anchor = budget.start_date
    ? parseWallKey(tzDayKey(new Date(budget.start_date), timeZone))
    : { year: now.year, month: 1, day: 1 };

  if (budget.period === "weekly") {
    const delta = (dayOfWeek(now.year, now.month, now.day)
      - dayOfWeek(anchor.year, anchor.month, anchor.day) + 7) % 7;
    const startMs = Date.UTC(now.year, now.month - 1, now.day) - delta * 86400000;
    const s = new Date(startMs);
    const e = new Date(startMs + 7 * 86400000);
    return {
      from: zonedWallToUtc(wallKey(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate()), timeZone),
      to: zonedWallToUtc(wallKey(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate()), timeZone),
    };
  }

  const step = MONTHS_PER_PERIOD[budget.period] ?? 1;
  let index = (now.year - anchor.year) * 12 + (now.month - anchor.month);
  // Before the anchor day has come round this month, we're still in the previous period.
  if (now.day < clampDay(now.year, now.month, anchor.day)) index -= 1;
  index = Math.floor(index / step) * step;

  const s = addMonths(anchor.year, anchor.month, index);
  const e = addMonths(anchor.year, anchor.month, index + step);
  return {
    from: zonedWallToUtc(wallKey(s.year, s.month, clampDay(s.year, s.month, anchor.day)), timeZone),
    to: zonedWallToUtc(wallKey(e.year, e.month, clampDay(e.year, e.month, anchor.day)), timeZone),
  };
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
export function seedPeriods(from: Date, to: Date, groupBy: GroupBy, timeZone: string): string[] {
  const keys: string[] = [];
  if (to < from) return keys;

  const startKey = tzDayKey(from, timeZone);
  const endKey = tzDayKey(to, timeZone);
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
