import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";

/** Everything at or past this share of its limit is worth looking at before the rest. */
export const NEAR_LIMIT_PERCENT = 80;

/**
 * The worst news in a budget, as a percentage: the overall limit's, or - when the budget
 * caps only named people - the tightest of those. This is what decides both the ordering
 * below and whether a card needs a warning.
 */
export function worstPercent(budget: BudgetStatus): number {
    const percents = [
        ...(budget.percent === undefined ? [] : [budget.percent]),
        ...budget.sub_budgets.map((s) => s.percent),
    ];
    return percents.length ? Math.max(...percents) : 0;
}

/** Whether anything in this budget - the overall limit or any person's - is past it. */
export function isOver(budget: BudgetStatus): boolean {
    return budget.over === true || budget.sub_budgets.some((s) => s.over);
}

/** How many separate limits in this budget are past their cap. */
export function overCount(budget: BudgetStatus): number {
    return (budget.over ? 1 : 0) + budget.sub_budgets.filter((s) => s.over).length;
}

export function budgetLabel(budget: BudgetStatus): string {
    return budget.categories.length ? budget.categories.join(", ") : "Everything";
}

/**
 * Trouble first, then alphabetical.
 *
 * Sorting purely by percentage would reshuffle the list every time a purchase lands, so
 * budgets are bucketed - over, near the limit, fine - and ordered by name inside each
 * bucket. What needs attention rises to the top; everything else stays where the reader
 * last saw it.
 */
export function sortBudgets(budgets: BudgetStatus[]): BudgetStatus[] {
    const band = (b: BudgetStatus) => (isOver(b) ? 0 : worstPercent(b) >= NEAR_LIMIT_PERCENT ? 1 : 2);
    return [...budgets].sort((a, b) => {
        const byBand = band(a) - band(b);
        if (byBand !== 0) return byBand;
        const byLabel = budgetLabel(a).localeCompare(budgetLabel(b), undefined, { sensitivity: "base" });
        if (byLabel !== 0) return byLabel;
        return a.period.localeCompare(b.period);
    });
}
