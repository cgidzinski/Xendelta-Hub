import type { BudgetPeriod } from "../../../../../hooks/xenbudget/types";

/**
 * How a budget's period is shown to people.
 *
 * The raw `period` value ("quarterly") and the server's `period_from`/`period_to` window
 * are machine-shaped. These helpers turn them into the three things a reader actually
 * wants: the name of the window it's in ("Q3 2026"), the amount as an explicit rate
 * ("$3,000 / quarter"), and a normalized per-month figure ("≈ $1,000/mo") so budgets on
 * different periods can be compared at a glance.
 *
 * All date math here is UTC-day based, matching the server's windows (see budgetForRange)
 * - never date-fns local-time helpers, which split whole periods across zone boundaries.
 */

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Aug 24" from a UTC ISO timestamp. */
function monthDay(iso: string): string {
    const d = new Date(iso);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Aug 2026" from a UTC ISO timestamp. */
function monthYear(iso: string): string {
    const d = new Date(iso);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Q3 2026" from a UTC ISO timestamp. */
function quarterYear(iso: string): string {
    const d = new Date(iso);
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${quarter} ${d.getUTCFullYear()}`;
}

/**
 * The name of the window a budget is currently in.
 *
 * `from`/`to` are the budget's own `period_from`/`period_to` (already snapped by the
 * server). For a custom budget they're its fixed date range.
 */
export function windowLabel(period: BudgetPeriod, from: string, to: string): string {
    switch (period) {
        case "weekly": return `Week of ${monthDay(from)}`;
        case "monthly": return monthYear(from);
        case "quarterly": return quarterYear(from);
        case "yearly": return String(new Date(from).getUTCFullYear());
        case "custom": {
            const f = new Date(from);
            const t = new Date(to);
            const year = f.getUTCFullYear();
            const suffix = t.getUTCFullYear() === year
                ? String(year)
                : `${year} – ${t.getUTCFullYear()}`;
            return `${monthDay(from)} – ${monthDay(to)}, ${suffix}`;
        }
    }
}

/** The noun a rate uses: "week", "month", "quarter", "year" or "period". */
export function periodNoun(period: BudgetPeriod): string {
    switch (period) {
        case "weekly": return "week";
        case "monthly": return "month";
        case "quarterly": return "quarter";
        case "yearly": return "year";
        default: return "period";
    }
}

// Simple per-month factors: a week is a quarter of a month, a quarter is three months, a
// year is twelve. Deliberately approximate - the point is a comparable ballpark figure,
// not an exact proration.
const MONTHLY_FACTORS: Record<Exclude<BudgetPeriod, "custom">, number> = {
    weekly: 4,        // a week is about a quarter of a month
    monthly: 1,
    quarterly: 1 / 3, // a quarter is three months
    yearly: 1 / 12,   // a year is twelve months
};

export interface NormalizedAmounts {
    weekly?: number;
    monthly?: number;
    quarterly?: number;
    yearly?: number;
}

/**
 * The amount restated per week, per month, per quarter and per year, each rounded to
 * cents. A $3,000 quarterly budget reads $250/wk, $1,000/mo, $3,000/qtr, $12,000/yr.
 * Empty for a one-off custom period or a missing amount.
 */
export function normalizedAmounts(
    period: BudgetPeriod, amount: number | undefined,
): NormalizedAmounts {
    if (period === "custom" || amount === undefined || amount <= 0) return {};
    const perMonth = amount * MONTHLY_FACTORS[period];
    return {
        weekly: Math.round((perMonth / 4) * 100) / 100,
        monthly: Math.round(perMonth * 100) / 100,
        quarterly: Math.round(perMonth * 3 * 100) / 100,
        yearly: Math.round(perMonth * 12 * 100) / 100,
    };
}

/**
 * The amount as a per-month figure, rounded to cents, or undefined when there is no
 * overall amount or the period is a one-off custom range (which has no clean per-month).
 */
export function monthlyEquivalent(
    period: BudgetPeriod, amount: number | undefined,
): number | undefined {
    return normalizedAmounts(period, amount).monthly;
}
