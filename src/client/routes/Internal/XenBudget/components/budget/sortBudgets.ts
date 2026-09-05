import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";
import { NEAR_LIMIT_PERCENT, budgetVerdict, directionOf } from "./budgetKind";

export { NEAR_LIMIT_PERCENT };

/**
 * Every limit in a budget - the overall one and each person's - as plain percentages.
 */
function percents(budget: BudgetStatus): number[] {
    return [
        ...(budget.percent === undefined ? [] : [budget.percent]),
        ...budget.sub_budgets.map((s) => s.percent),
    ];
}

/**
 * How much attention a budget wants, as a percentage that always points the same way:
 * bigger means more worrying.
 *
 * For a cap that is simply the highest percentage in it. For an income target it has to be
 * inverted - a target at 20% is the one in trouble and one at 120% is done - so the
 * *lowest* progress becomes the highest concern. Without this an income target would sort
 * as if earning almost nothing were the safest possible state.
 */
export function troublePercent(budget: BudgetStatus): number {
    const all = percents(budget);
    if (all.length === 0) return 0;
    if (directionOf(budget.measures) === "ceiling") return Math.max(...all);
    // Clamped at zero: a target that has been beaten is as untroubled as a budget gets,
    // and a negative concern would sort it below one that is exactly on target.
    return Math.max(0, 100 - Math.min(...all));
}

/** The highest percentage in a budget, direction ignored. Used where raw progress matters. */
export function worstPercent(budget: BudgetStatus): number {
    const all = percents(budget);
    return all.length ? Math.max(...all) : 0;
}

/**
 * Whether a CAP has been breached - never a target, where passing the amount is the point.
 * This is what the Overview header counts, so a met income target can't show up as
 * a problem.
 */
export function isOverCap(budget: BudgetStatus): boolean {
    if (directionOf(budget.measures) === "floor") return false;
    return budget.over === true || budget.sub_budgets.some((s) => s.over);
}

/** How many separate caps in this budget are past their limit. */
export function overCount(budget: BudgetStatus): number {
    if (directionOf(budget.measures) === "floor") return 0;
    return (budget.over ? 1 : 0) + budget.sub_budgets.filter((s) => s.over).length;
}

/** How many separate savings targets in this budget have been reached. */
export function metCount(budget: BudgetStatus): number {
    if (directionOf(budget.measures) === "ceiling") return 0;
    return (budget.over ? 1 : 0) + budget.sub_budgets.filter((s) => s.over).length;
}

export function budgetLabel(budget: BudgetStatus): string {
    return budget.categories.length ? budget.categories.join(", ") : "Everything";
}

/**
 * Trouble first, then alphabetical.
 *
 * Sorting purely by percentage would reshuffle the list every time a purchase lands, so
 * budgets are bucketed - in trouble, close to it, fine - and ordered by name inside each
 * bucket. What needs attention rises to the top; everything else stays where the reader
 * last saw it. An income target joins the same bands read the right way up: badly behind is
 * trouble, nearly there is fine, and met is the best state rather than the worst.
 */
export function sortBudgets(budgets: BudgetStatus[]): BudgetStatus[] {
    const band = (b: BudgetStatus) => {
        if (isOverCap(b)) return 0;
        return troublePercent(b) >= NEAR_LIMIT_PERCENT ? 1 : 2;
    };
    return [...budgets].sort((a, b) => {
        const byBand = band(a) - band(b);
        if (byBand !== 0) return byBand;
        const byLabel = budgetLabel(a).localeCompare(budgetLabel(b), undefined, { sensitivity: "base" });
        if (byLabel !== 0) return byLabel;
        return a.period.localeCompare(b.period);
    });
}

export interface VerdictCounts {
    passed: number;
    missed: number;
    /** passed + missed. Excludes limits with nothing in them, which are not results. */
    judged: number;
}

/**
 * How a closed window went, counted the same way `overCount` counts a live one: every
 * separate limit in every budget, the shared one and each person's.
 *
 * Only limits with an amount to judge against and items to judge are counted, so "4 of 6"
 * never quietly includes a category nobody spent in - a book with no imports would
 * otherwise report a clean sweep.
 */
export function verdictCounts(budgets: BudgetStatus[], asOf: string): VerdictCounts {
    let passed = 0;
    let missed = 0;

    const tally = (
        direction: ReturnType<typeof directionOf>,
        percent: number | undefined,
        itemCount: number,
        periodTo: string,
    ) => {
        if (percent === undefined) return;
        const { key } = budgetVerdict(direction, percent, itemCount, periodTo, asOf);
        if (key === "pass") passed++;
        else if (key === "miss") missed++;
    };

    for (const b of budgets) {
        const direction = directionOf(b.measures);
        tally(direction, b.percent, b.item_count, b.period_to);
        for (const sub of b.sub_budgets) {
            tally(direction, sub.percent, sub.item_count, b.period_to);
        }
    }

    return { passed, missed, judged: passed + missed };
}
