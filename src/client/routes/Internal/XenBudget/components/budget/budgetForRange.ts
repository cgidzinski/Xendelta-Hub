import {
    addMonths, addQuarters, addWeeks, addYears,
    startOfMonth, startOfQuarter, startOfWeek, startOfYear,
} from "date-fns";
import type { BudgetPeriod } from "../../../../../hooks/xenbudget/types";

/**
 * How much a budget allows over an ARBITRARY range.
 *
 * A budget caps one period at a time; a report covers whatever range was picked. Putting
 * the two in the same table needs the cap restated for that range, which is what this
 * does: every period the range touches contributes its amount in proportion to how much
 * of it the range actually covers. Twelve whole months of an $800 monthly cap come to
 * exactly $9,600, and a half-month tail adds $400 rather than a whole month's worth.
 *
 * Boundaries follow the calendar in the viewer's own timezone, matching the server's
 * budgetPeriodRange - the same reason the budget queries send a tz.
 */

/** A weekly budget over a decade is ~520 steps; this only catches a non-advancing period. */
const MAX_PERIODS = 5000;

const STEPS: Record<Exclude<BudgetPeriod, "custom">, {
    start: (d: Date) => Date;
    next: (d: Date) => Date;
}> = {
    // Monday-to-Monday, matching the server's ISO-week convention.
    weekly: { start: (d) => startOfWeek(d, { weekStartsOn: 1 }), next: (d) => addWeeks(d, 1) },
    monthly: { start: startOfMonth, next: (d) => addMonths(d, 1) },
    quarterly: { start: startOfQuarter, next: (d) => addQuarters(d, 1) },
    yearly: { start: startOfYear, next: (d) => addYears(d, 1) },
};

function overlapMs(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): number {
    const from = Math.max(aFrom.getTime(), bFrom.getTime());
    const to = Math.min(aTo.getTime(), bTo.getTime());
    return Math.max(0, to - from);
}

export interface RangeBudget {
    period: BudgetPeriod;
    /** Absent when the budget sets no overall cap - then there is nothing to scale. */
    amount?: number;
    /** For a custom budget these are its fixed window; otherwise unused. */
    period_from: string;
    period_to: string;
}

/**
 * How many of the budget's own periods the range covers, counting partial ones as the
 * fraction actually covered. Twelve whole months of a monthly budget is 12; a half-month
 * tail adds 0.5.
 *
 * This is the whole of the range maths - `budgetedForRange` is just this times the amount,
 * and scaling a sub-budget's amount uses the same factor.
 */
export function periodsInRange(
    budget: Pick<RangeBudget, "period" | "period_from" | "period_to">,
    rangeFrom: Date,
    rangeTo: Date,
): number {
    if (rangeTo.getTime() <= rangeFrom.getTime()) return 0;

    // A one-off budget is a single fixed window, not a repeating one, so it contributes
    // only the fraction of itself the range happens to cover.
    if (budget.period === "custom") {
        const from = new Date(budget.period_from);
        const to = new Date(budget.period_to);
        const span = to.getTime() - from.getTime();
        if (span <= 0) return 0;
        return overlapMs(from, to, rangeFrom, rangeTo) / span;
    }

    const step = STEPS[budget.period];
    if (!step) return 0;

    let total = 0;
    let periodStart = step.start(rangeFrom);
    for (let i = 0; periodStart.getTime() < rangeTo.getTime() && i < MAX_PERIODS; i++) {
        const periodEnd = step.next(periodStart);
        const span = periodEnd.getTime() - periodStart.getTime();
        if (span <= 0) break;
        total += overlapMs(periodStart, periodEnd, rangeFrom, rangeTo) / span;
        periodStart = periodEnd;
    }
    return total;
}

export function budgetedForRange(budget: RangeBudget, rangeFrom: Date, rangeTo: Date): number {
    const { amount } = budget;
    if (amount === undefined || amount <= 0) return 0;
    return amount * periodsInRange(budget, rangeFrom, rangeTo);
}
