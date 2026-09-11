import type { BudgetPeriod } from "../../../../../hooks/xenbudget/types";
import type { PeriodUnit } from "../periodMode";

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

/**
 * How many of each ladder unit make a year.
 *
 * NOMINAL, not astronomical: 52 weeks and 365 days, never 52.1775 and 365.2425. A $600/yr
 * budget has to read exactly $50 a month and $11.54 a week in EVERY month and every week -
 * February included, and including a week that straddles a month boundary. A cap that moved
 * with the length of the window it happened to be shown in would be unreadable, and is what
 * prorating by actual days gives you ($1.79 a day in February against $1.61 in January).
 *
 * These are also round-trip stable - $100/wk -> $5,200/yr -> $100/wk - which drifting
 * factors are not. Week-to-month falls out as 52/12, exactly what the server's recurring
 * detection already uses (PER_MONTH, xenBudgetRecurring.ts).
 */
const PER_YEAR: Record<PeriodUnit, number> = {
    day: 365,
    week: 52,
    month: 12,
    quarter: 4,
    year: 1,
};

/** The ladder unit a stored budget period is denominated in. A one-off `custom` has none. */
const PERIOD_UNIT: Record<Exclude<BudgetPeriod, "custom">, PeriodUnit> = {
    weekly: "week",
    monthly: "month",
    quarterly: "quarter",
    yearly: "year",
};

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * A budget's amount as a yearly figure - the pivot every other rate divides out of.
 *
 * Undefined for a one-off custom budget, which has no repeating period to annualise, and for
 * a budget that sets no overall amount (it caps only named people).
 */
export function annualEquivalent(
    period: BudgetPeriod, amount: number | undefined,
): number | undefined {
    if (period === "custom" || amount === undefined || amount <= 0) return undefined;
    return amount * PER_YEAR[PERIOD_UNIT[period]];
}

/**
 * A budget's amount restated in `unit`, rounded to cents.
 *
 * This is what the display ladder shows, and the whole point of it is what it does NOT
 * depend on: the figure is a function of the budget and the chosen unit only, so stepping
 * the window from January to February leaves it exactly where it was. The spend it is read
 * against is still measured over the real window, which is what makes the pair meaningful -
 * the allowance is nominal, the spending is real, and a short month is good luck.
 */
export function amountForUnit(
    period: BudgetPeriod, amount: number | undefined, unit: PeriodUnit,
): number | undefined {
    const annual = annualEquivalent(period, amount);
    return annual === undefined ? undefined : round(annual / PER_YEAR[unit]);
}

export interface NormalizedAmounts {
    daily?: number;
    weekly?: number;
    monthly?: number;
    quarterly?: number;
    yearly?: number;
}

/**
 * The amount restated in every unit at once, each rounded to cents. A $3,000 quarterly
 * budget reads $32.88/day, $230.77/wk, $1,000/mo, $3,000/qtr, $12,000/yr. Empty for a
 * one-off custom period or a missing amount.
 */
export function normalizedAmounts(
    period: BudgetPeriod, amount: number | undefined,
): NormalizedAmounts {
    const annual = annualEquivalent(period, amount);
    if (annual === undefined) return {};
    return {
        daily: round(annual / PER_YEAR.day),
        weekly: round(annual / PER_YEAR.week),
        monthly: round(annual / PER_YEAR.month),
        quarterly: round(annual / PER_YEAR.quarter),
        yearly: round(annual),
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
