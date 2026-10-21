import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";
import type { PeriodUnit } from "../periodMode";
import { periodsInRange } from "./budgetForRange";
import { amountForUnit } from "./periodDisplay";

const round = (v: number) => Math.round(v * 100) / 100;

/** One limit's derived figures, recomputed from a restated amount. */
function derive(amount: number, spent: number) {
    return {
        amount,
        remaining: round(amount - spent),
        // Uncapped rather than clamped, matching the server, so a bar can still show
        // how far past the amount it went.
        percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
        over: spent > amount,
    };
}

/**
 * Applies `amountFor` to every limit in a budget - the overall one and each person's - and
 * recomputes what hangs off it.
 *
 * `amount === undefined` is left alone: it means "this budget caps only named people", and
 * the whole client keys "is there an overall bar" off that.
 *
 * `periods` is left alone too, and deliberately: those are the budget's OWN whole periods,
 * each already measured against its own amount. Restating them would be wrong twice over -
 * the spend is not this window's, and the amount is not either.
 */
function restate(budget: BudgetStatus, amountFor: (amount: number) => number): BudgetStatus {
    const overall = budget.amount === undefined
        ? {}
        : derive(amountFor(budget.amount), budget.spent);

    return {
        ...budget,
        ...overall,
        sub_budgets: budget.sub_budgets.map((sub) => ({
            ...sub,
            ...derive(amountFor(sub.amount), sub.spent),
        })),
    };
}

/**
 * A budget's limits restated for an arbitrary reporting range.
 *
 * The server measures SPEND over whatever window it is asked for, but `amount` is always
 * the budget's own per-period figure - an $800 monthly cap stays $800 whether the report
 * covers a month or a decade. Reading a year of spending against one month's cap is
 * nonsense, so the amounts are scaled by however many of the budget's periods the range
 * covers (see `periodsInRange`).
 *
 * This is the right maths for a span that is not one calendar unit - a hand-picked range,
 * "last 3 months", a one-off budget's fixed window. For the display ladder, where the
 * window IS one calendar unit, `restateBudgetToUnit` applies instead: proportional overlap
 * would make a monthly cap worth less in February than in January, which is unreadable.
 */
export function scaleBudgetToRange(
    budget: BudgetStatus, rangeFrom: Date, rangeTo: Date,
): BudgetStatus {
    const factor = periodsInRange(budget, rangeFrom, rangeTo);
    return restate(budget, (amount) => round(amount * factor));
}

/**
 * A budget's limits restated in one ladder unit - day, week, month, quarter or year.
 *
 * Unlike range scaling this is a nominal conversion (see `PER_YEAR` in periodDisplay), so
 * the figures depend on the budget and the unit and nothing else: a $600/yr budget reads
 * $50 in February exactly as it does in January, and a week that straddles a month boundary
 * reads the same as one that doesn't. The spend beside it is still whatever was really
 * spent in that window.
 *
 * Returns null for a one-off `custom` budget, which has no repeating period and so no
 * nominal rate; the caller falls back to range scaling, which is the right maths for a
 * fixed window.
 */
export function restateBudgetToUnit(
    budget: BudgetStatus, unit: PeriodUnit,
): BudgetStatus | null {
    if (budget.period === "custom") return null;
    return restate(
        budget,
        (amount) => amountForUnit(budget.period, amount, unit) ?? amount,
    );
}
