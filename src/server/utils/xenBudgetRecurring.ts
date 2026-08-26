// Recurring-charge detection.
//
// Everything in a book arrives by CSV, which means a subscription is already sitting in
// the data as twelve unrelated rows. Nothing writes anything here: this reads history and
// says "these twelve rows are one $16.99 monthly charge". Detection rather than
// scheduling, deliberately — the real transactions keep arriving by import, so generating
// occurrences of our own would only double-count them.
//
// Pure: no model, socket or route imports, so it stays unit-testable and the route above
// it is a thin caller. Same arrangement as xenBudgetRules.ts.

import { advanceDate, type ScheduleFrequency } from "./scheduleUtils";
import { roundMoney } from "./xenBudgetUtils";

// --- Merchant normalisation -------------------------------------------------

// Payment processors and terminals prefix the merchant's real name, so the same coffee
// shop arrives as "SQ *COFFEE", "TST* COFFEE" and "POS COFFEE" across three cards. These
// are stripped from the FRONT only — a merchant legitimately named "SPA" must survive.
const PROCESSOR_PREFIXES = [
  "SQ *", "SQ*", "TST* ", "TST*", "PAYPAL *", "PAYPAL*", "PP*", "PP *",
  "SP *", "SP*", "POS ", "POS/", "DEBIT ", "CREDIT ", "VISA ", "MC ",
  "PURCHASE ", "PRE-AUTH ", "PREAUTH ", "RECURRING ", "WWW.", "HTTP://", "HTTPS://",
];

/**
 * A merchant name stable enough to group on.
 *
 * The same subscription arrives with a different reference number every month
 * ("NETFLIX.COM 8829472"), so anything that varies per-charge has to come off or every
 * occurrence becomes its own merchant and nothing is ever detected.
 *
 * Deliberately conservative: it removes only what is reliably noise (processor prefixes,
 * long digit runs, store numbers, punctuation). Over-normalising is worse than
 * under-normalising here, because merging two genuinely different merchants invents a
 * series that does not exist, while failing to merge only misses one.
 */
export function normalizeMerchant(description: string): string {
  let text = (description || "").toUpperCase().trim();

  // Repeated because a description can carry two ("POS SQ *COFFEE"), and each pass can
  // expose the next one.
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of PROCESSOR_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        stripped = true;
      }
    }
  }

  text = text
    // "#1234" — a store or terminal number.
    .replace(/#\s*\d+/g, " ")
    // Any run of 4+ digits: reference, invoice and authorisation numbers. Shorter runs
    // stay, so "7-ELEVEN" and "STORE 22" keep the digits that are part of the name.
    .replace(/\d{4,}/g, " ")
    // Card tails and dates left in the tail of a description.
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    // Everything that isn't a letter, digit or space becomes a gap, so "NETFLIX.COM" and
    // "NETFLIX COM" land on the same key.
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

/** Escapes a token for literal use inside a regular expression. */
function escapeToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern that finds a normalised merchant back in the RAW descriptions it came from.
 *
 * Normalising is lossy in a way that breaks plain substring search: "NETFLIX.COM 8829472"
 * becomes "NETFLIX COM", and searching for that literal string finds nothing, because the
 * dot the normaliser turned into a space is still a dot in the stored description. So the
 * tokens are re-joined with "whatever separator was there originally" — which matches
 * "NETFLIX.COM", "NETFLIX COM" and "NETFLIXCOM" alike.
 *
 * The leading boundary stops a short merchant matching inside a longer word ("APPLE"
 * finding "PINEAPPLE"). There is no trailing boundary on purpose: the reference number and
 * store number that follow a merchant are exactly what we stripped, and requiring the
 * description to end there would find nothing at all.
 */
export function merchantMatchPattern(merchant: string): string {
  const tokens = normalizeMerchant(merchant).split(" ").filter(Boolean);
  if (tokens.length === 0) return "";
  return `(?:^|[^A-Za-z0-9])${tokens.map(escapeToken).join("[^A-Za-z0-9]*")}`;
}

// --- Frequency classification ----------------------------------------------

/**
 * Nominal gap in days, and how far a single gap may stray before the series stops looking
 * regular. Monthly gets ±5 because calendar months really are 28-31 days; yearly gets ±20
 * because an annual renewal drifts by a weekend or a billing-day change.
 */
const FREQUENCY_SHAPES: { frequency: ScheduleFrequency; days: number; tolerance: number }[] = [
  { frequency: "weekly", days: 7, tolerance: 2 },
  { frequency: "biweekly", days: 14, tolerance: 3 },
  { frequency: "monthly", days: 30.44, tolerance: 5 },
  { frequency: "quarterly", days: 91.3, tolerance: 10 },
  { frequency: "yearly", days: 365.25, tolerance: 20 },
];

/** How many of each period fit in a month — what a series costs per month. */
const PER_MONTH: Record<ScheduleFrequency, number> = {
  daily: 30.44,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const DAY_MS = 86_400_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Which cadence a set of gaps looks like, or null when they are simply irregular.
 *
 * Both halves matter. The median has to land near a real cadence, AND the gaps have to
 * agree with each other — a shop visited "every week or two" has a median near 7 and
 * belongs nowhere. Median absolute deviation is used rather than the mean's, so one
 * doubled gap (a missed month, a card reissue) doesn't disqualify an otherwise clean
 * series.
 */
export function classifyFrequency(gapDays: number[]): ScheduleFrequency | null {
  if (gapDays.length < 2) return null;
  const mid = median(gapDays);

  const shape = FREQUENCY_SHAPES.find((s) => Math.abs(mid - s.days) <= s.tolerance);
  if (!shape) return null;

  const deviation = median(gapDays.map((g) => Math.abs(g - mid)));
  return deviation <= shape.tolerance ? shape.frequency : null;
}

function shapeFor(frequency: ScheduleFrequency) {
  return FREQUENCY_SHAPES.find((s) => s.frequency === frequency)
    ?? { frequency, days: PER_MONTH[frequency] ? 30.44 / PER_MONTH[frequency] : 30.44, tolerance: 5 };
}

// --- Price levels -----------------------------------------------------------

export interface RecurringPriceChange {
  /** The first occurrence charged at the new amount. */
  date: string;
  from: number;
  to: number;
}

/** Two amounts count as the same price when they're within this of each other. */
const SAME_PRICE_TOLERANCE = 0.02;

/**
 * Walks occurrences in date order and splits them where the price moves and STAYS moved.
 *
 * This is what separates a subscription from a shop. Netflix at 11.99 then 13.99 is two
 * runs; a grocery store is a new run every single visit. So the count of runs, measured
 * against the number of occurrences, is the test for "is this a fixed charge at all" —
 * and it comes for free with the price-change list the UI wants anyway.
 */
export function priceLevels(amounts: number[]): { amount: number; startIndex: number }[] {
  const levels: { amount: number; startIndex: number }[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const current = levels[levels.length - 1];
    const drift = current && current.amount !== 0
      ? Math.abs(amounts[i] - current.amount) / Math.abs(current.amount)
      : Infinity;
    if (!current || drift > SAME_PRICE_TOLERANCE) {
      levels.push({ amount: amounts[i], startIndex: i });
    }
  }
  return levels;
}

// --- Detection --------------------------------------------------------------

export interface RecurringInputItem {
  date: Date;
  amount: number;
  description: string;
  categories?: { name?: string }[];
}

export type RecurringStatus = "active" | "missing" | "ended";

export interface RecurringSeries {
  /** Stable React key. */
  key: string;
  /** The normalised name the series was grouped on. */
  merchant: string;
  /** The most recent raw description, so the UI can show what it actually looks like. */
  sample_description: string;
  /** The amount currently being charged — the latest price level, not an average. */
  amount: number;
  frequency: ScheduleFrequency;
  occurrences: number;
  first_date: string;
  last_date: string;
  next_expected: string;
  /** What this series costs per month, whatever its cadence. */
  monthly_equivalent: number;
  /** Categories seen on the series' items, most recent first. */
  categories: string[];
  status: RecurringStatus;
  price_changes: RecurringPriceChange[];
}

/** Below this a run of charges is a coincidence, not a pattern. */
export const MIN_OCCURRENCES = 3;

/**
 * How many distinct price levels a series may carry before it stops being a fixed charge.
 *
 * Scaled to the length of the series: two levels is always allowed (one price rise), and a
 * long series earns a little more latitude. A shop, whose every visit is its own level,
 * fails this at any length — which is the point.
 */
function maxPriceLevels(occurrences: number): number {
  return Math.max(2, Math.ceil(occurrences / 4));
}

/**
 * Every recurring charge in `items`, most expensive per month first.
 *
 * `now` is passed in rather than read from the clock so the status classification is
 * testable and so a request's figures are all measured against one instant.
 */
export function detectRecurring(items: RecurringInputItem[], now: Date): RecurringSeries[] {
  const byMerchant = new Map<string, RecurringInputItem[]>();
  for (const item of items) {
    const merchant = normalizeMerchant(item.description);
    // A description that normalises away to nothing (all digits, say) can't be grouped on
    // — every such row would pile into one meaningless bucket.
    if (!merchant) continue;
    const bucket = byMerchant.get(merchant);
    if (bucket) bucket.push(item);
    else byMerchant.set(merchant, [item]);
  }

  const series: RecurringSeries[] = [];

  for (const [merchant, bucket] of byMerchant) {
    if (bucket.length < MIN_OCCURRENCES) continue;

    const occurrences = [...bucket].sort((a, b) => a.date.getTime() - b.date.getTime());

    const gapDays: number[] = [];
    for (let i = 1; i < occurrences.length; i++) {
      gapDays.push((occurrences[i].date.getTime() - occurrences[i - 1].date.getTime()) / DAY_MS);
    }
    const frequency = classifyFrequency(gapDays);
    if (!frequency) continue;

    const levels = priceLevels(occurrences.map((o) => o.amount));
    if (levels.length > maxPriceLevels(occurrences.length)) continue;

    const first = occurrences[0];
    const last = occurrences[occurrences.length - 1];
    // The CURRENT price, not an average across a rise — "you pay $13.99" is the useful
    // figure, and averaging it with last year's $11.99 answers nobody's question.
    const amount = roundMoney(levels[levels.length - 1].amount);

    const priceChanges: RecurringPriceChange[] = levels.slice(1).map((level, i) => ({
      date: occurrences[level.startIndex].date.toISOString(),
      from: roundMoney(levels[i].amount),
      to: roundMoney(level.amount),
    }));

    // Anchored on the LAST occurrence rather than the first: a series that skipped a month
    // or shifted its billing day should predict from where it actually is, not from where
    // an unbroken run from the first charge would have put it.
    const nextExpected = advanceDate(last.date, frequency, 1);
    const shape = shapeFor(frequency);
    const overdueDays = (now.getTime() - nextExpected.getTime()) / DAY_MS;
    const silentDays = (now.getTime() - last.date.getTime()) / DAY_MS;
    const status: RecurringStatus = overdueDays <= shape.tolerance
      ? "active"
      : silentDays > shape.days * 2 + shape.tolerance ? "ended" : "missing";

    // Most recent first: a series that was recategorised should lead with what it is now.
    const categories: string[] = [];
    for (let i = occurrences.length - 1; i >= 0; i--) {
      for (const category of occurrences[i].categories ?? []) {
        if (category?.name && !categories.includes(category.name)) categories.push(category.name);
      }
    }

    series.push({
      key: merchant,
      merchant,
      sample_description: last.description,
      amount,
      frequency,
      occurrences: occurrences.length,
      first_date: first.date.toISOString(),
      last_date: last.date.toISOString(),
      next_expected: nextExpected.toISOString(),
      monthly_equivalent: roundMoney(amount * PER_MONTH[frequency]),
      categories,
      status,
      price_changes: priceChanges,
    });
  }

  // What it costs per month, not what it costs per charge — otherwise a yearly renewal
  // outranks the monthly bills that actually dominate the budget.
  series.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent
    || a.merchant.localeCompare(b.merchant));

  return series;
}

/**
 * Committed monthly spend: what the active series alone will cost every month.
 *
 * Series that have stopped are left out — money you no longer pay isn't a commitment — but
 * a MISSING one is counted, because a bill that hasn't posted yet is still owed.
 */
export function monthlyCommitted(series: RecurringSeries[]): number {
  return roundMoney(series
    .filter((s) => s.status !== "ended")
    .reduce((sum, s) => sum + s.monthly_equivalent, 0));
}
