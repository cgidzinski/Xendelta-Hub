import type {
    BudgetStatus, SummaryCategory, SummaryCategoryPeriod,
} from "../../../../../hooks/xenbudget/types";
import { budgetedForRange } from "../budget/budgetForRange";
import { budgetsForPerson } from "../budget/budgetPersonView";
import { shouldPivot } from "./periodColumns";

/** One line of the budget-vs-actual table. */
export interface CategoryReportRow {
    /** Stable React key. */
    key: string;
    label: string;
    /** The categories this line covers - one for a category row, several for a spanning one. */
    categories: string[];
    spent: number;
    /** Absent when no budget covers this line, which is different from a budget of zero. */
    budgeted?: number;
    /** Spend per period bucket, keyed as `by_period` is. Empty when the table isn't pivoted. */
    byPeriod: Record<string, number>;
}

export interface CategoryReport {
    /** One per category: everything with spending in the range, or a budget of its own. */
    rows: CategoryReportRow[];
    /**
     * Budgets covering several categories at once. They can't fill a cell on any single
     * category's row without inventing a split, so they get their own lines - and their
     * spend is money already counted in `rows`, which is why the totals below come from
     * the summary rather than from adding these up.
     */
    spanning: CategoryReportRow[];
    /** Budgets with no categories at all: a cap on the whole book. */
    wholeBook: number;
    /** Every kept budget scaled to the range, each counted exactly once. */
    totalBudgeted: number;
    /** True once anything at all is budgeted, so the column can be dropped when nothing is. */
    hasBudgets: boolean;
    /**
     * The period columns to render, in order. Empty when the range has only one bucket or
     * too many to read, in which case the table falls back to a single Spent column.
     */
    periodKeys: string[];
}

interface BuildInput {
    byCategory: SummaryCategory[];
    byCategoryPeriod: SummaryCategoryPeriod[];
    uncategorised: { total: number; count: number };
    uncategorisedByPeriod: { key: string; total: number }[];
    /** Every bucket in the range, in order, straight from `by_period`. */
    periodKeys: string[];
    budgets: BudgetStatus[];
    rangeFrom: Date;
    rangeTo: Date;
    /** Set when the page is narrowed to one member. */
    personId?: string;
}

/** Categories are matched by name, and a name can be spelled differently across items. */
const key = (name: string) => name.toLowerCase();

/**
 * The cap that applies to whoever is being looked at.
 *
 * Unfiltered that's the budget's overall amount. Narrowed to one member it's their own
 * limit inside it - a household cap is not that member's allowance, so a shared budget
 * with no personal limit for them contributes nothing to their column.
 */
function limitFor(budget: BudgetStatus, personId?: string): number | undefined {
    if (!personId) return budget.amount;
    return budget.sub_budgets.find((s) => s.person_id === personId)?.amount;
}

export function buildCategoryReport({
    byCategory, byCategoryPeriod, uncategorised, uncategorisedByPeriod, periodKeys,
    budgets, rangeFrom, rangeTo, personId,
}: BuildInput): CategoryReport {
    const kept = personId ? budgetsForPerson(budgets, personId) : budgets;
    const pivoted = shouldPivot(periodKeys);

    const spentByCategory = new Map<string, { label: string; spent: number }>();
    for (const row of byCategory) {
        spentByCategory.set(key(row.category), { label: row.category, spent: row.total });
    }

    // Cells for the grid. Only assembled when the table is actually pivoted - a month
    // view would build 31 buckets per category and then throw them away.
    const cellsByCategory = new Map<string, Record<string, number>>();
    if (pivoted) {
        for (const cell of byCategoryPeriod) {
            const bucket = cellsByCategory.get(key(cell.category)) ?? {};
            bucket[cell.key] = (bucket[cell.key] ?? 0) + cell.total;
            cellsByCategory.set(key(cell.category), bucket);
        }
    }

    const budgetedByCategory = new Map<string, { label: string; budgeted: number }>();
    const spanning: CategoryReportRow[] = [];
    let wholeBook = 0;
    let totalBudgeted = 0;
    let hasBudgets = false;

    for (const budget of kept) {
        const budgeted = budgetedForRange(
            {
                period: budget.period,
                amount: limitFor(budget, personId),
                period_from: budget.period_from,
                period_to: budget.period_to,
            },
            rangeFrom, rangeTo,
        );
        if (budgeted <= 0) continue;
        hasBudgets = true;
        totalBudgeted += budgeted;

        if (budget.categories.length === 0) {
            wholeBook += budgeted;
        } else if (budget.categories.length === 1) {
            const name = budget.categories[0];
            const existing = budgetedByCategory.get(key(name));
            budgetedByCategory.set(key(name), {
                label: existing?.label ?? name,
                budgeted: (existing?.budgeted ?? 0) + budgeted,
            });
        } else {
            spanning.push({
                key: budget._id,
                label: budget.categories.join(" + "),
                categories: budget.categories,
                // Money already on the category rows above, restated so it can be read
                // against this budget's own combined cap.
                spent: budget.categories.reduce(
                    (sum, name) => sum + (spentByCategory.get(key(name))?.spent ?? 0), 0,
                ),
                byPeriod: sumCells(budget.categories.map((name) => cellsByCategory.get(key(name)))),
                budgeted,
            });
        }
    }

    // A category earns a row by having been spent on, or by having a cap of its own - a
    // budget nobody spent against is exactly the thing a report should surface.
    const names = new Set([...spentByCategory.keys(), ...budgetedByCategory.keys()]);
    const rows: CategoryReportRow[] = [...names].map((name) => {
        const spend = spentByCategory.get(name);
        const budget = budgetedByCategory.get(name);
        const label = spend?.label ?? budget?.label ?? name;
        return {
            key: name,
            label,
            categories: [label],
            spent: spend?.spent ?? 0,
            byPeriod: cellsByCategory.get(name) ?? {},
            budgeted: budget?.budgeted,
        };
    });

    rows.sort((a, b) => b.spent - a.spent
        || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

    if (uncategorised.count > 0) {
        rows.push({
            key: "__uncategorised__",
            label: "Uncategorised",
            categories: [],
            spent: uncategorised.total,
            byPeriod: pivoted
                ? Object.fromEntries(uncategorisedByPeriod.map((r) => [r.key, r.total]))
                : {},
        });
    }

    spanning.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

    return {
        rows, spanning, wholeBook, totalBudgeted, hasBudgets,
        periodKeys: pivoted ? periodKeys : [],
    };
}

/** Adds several categories' period cells together for a budget that spans them. */
function sumCells(buckets: (Record<string, number> | undefined)[]): Record<string, number> {
    const total: Record<string, number> = {};
    for (const bucket of buckets) {
        for (const [periodKey, value] of Object.entries(bucket ?? {})) {
            total[periodKey] = (total[periodKey] ?? 0) + value;
        }
    }
    return total;
}
