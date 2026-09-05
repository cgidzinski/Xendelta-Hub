import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";
import { periodsInRange } from "./budgetForRange";

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * A budget's limits restated for an arbitrary reporting range.
 *
 * The server measures SPEND over whatever window it is asked for, but `amount` is always
 * the budget's own per-period figure - an $800 monthly cap stays $800 whether the report
 * covers a month or a decade. Reading a year of spending against one month's cap is
 * nonsense, so the amounts are scaled by however many of the budget's periods the range
 * covers (see `periodsInRange`) and every derived figure recomputed from there.
 *
 * `amount === undefined` is left alone: it means "this budget caps only named people", and
 * the whole client keys "is there an overall bar" off that.
 *
 * `periods` is left alone too, and deliberately: those are the budget's OWN whole periods,
 * each already measured against its own amount. Scaling them to the range would be wrong
 * twice over - the spend is not the range's, and the amount is not the range's either.
 */
export function scaleBudgetToRange(
    budget: BudgetStatus, rangeFrom: Date, rangeTo: Date,
): BudgetStatus {
    const factor = periodsInRange(budget, rangeFrom, rangeTo);

    const overall = budget.amount === undefined ? {} : (() => {
        const amount = round(budget.amount * factor);
        return {
            amount,
            remaining: round(amount - budget.spent),
            // Uncapped rather than clamped, matching the server, so a bar can still show
            // how far past the amount it went.
            percent: amount > 0 ? Math.round((budget.spent / amount) * 100) : 0,
            over: budget.spent > amount,
        };
    })();

    return {
        ...budget,
        ...overall,
        sub_budgets: budget.sub_budgets.map((sub) => {
            const amount = round(sub.amount * factor);
            return {
                ...sub,
                amount,
                remaining: round(amount - sub.spent),
                percent: amount > 0 ? Math.round((sub.spent / amount) * 100) : 0,
                over: sub.spent > amount,
            };
        }),
    };
}
