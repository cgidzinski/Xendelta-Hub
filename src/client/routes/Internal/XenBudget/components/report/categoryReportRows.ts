import type {
    BudgetKind, BudgetStatus, SummaryCategory, SummaryCategoryPeriod, SummaryPeriod,
} from "../../../../../hooks/xenbudget/types";
import { budgetedForRange } from "../budget/budgetForRange";
import { periodKeyRange, shouldPivot } from "./periodColumns";

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
    /**
     * Which way `budgeted` points. A row can only be one or the other: a category with
     * both a cap and a goal on it would be contradictory, so the first budget seen wins
     * and the other is left out of the column rather than silently added to it.
     */
    kind?: BudgetKind;
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
    /**
     * Caps and goals scaled to the range, kept apart. Adding a $9,600 spending cap to a
     * $6,000 savings target produces a number that means nothing, so they never are.
     */
    totalCapped: number;
    totalGoal: number;
    /** Spending inside categories that actually carry a cap - what `totalCapped` measures. */
    cappedSpend: number;
    /** Money that landed in categories carrying a savings goal. */
    goalSaved: number;
    /** True once anything at all is budgeted, so the column can be dropped when nothing is. */
    hasBudgets: boolean;
    hasGoals: boolean;
    /**
     * The period columns to render, in order. Empty when the range has only one bucket or
     * too many to read, in which case the table falls back to a single Spent column.
     */
    periodKeys: string[];
    /** The bottom block, each measure carrying a figure for every column. */
    summary: ReportSummaryRows;
}

/** One measure across the columns, plus its figure for the whole range. */
export interface PeriodTotals {
    byPeriod: Record<string, number>;
    total: number;
}

export interface ReportSummaryRows {
    /** Spending caps, restated for the range. */
    capped: PeriodTotals;
    /** Savings targets, restated for the range. Kept apart from caps deliberately. */
    goals: PeriodTotals;
    /** What actually landed in the categories carrying those targets. */
    saved: PeriodTotals;
    /** Every outgoing, capped or not. */
    spent: PeriodTotals;
    /**
     * Caps minus the spending inside CAPPED categories - a like-for-like comparison.
     * Measuring partial coverage against the book's entire outgoings, as this used to,
     * produced a number that looked alarming whenever anything was left unbudgeted.
     */
    capsLeft: PeriodTotals;
    income: PeriodTotals;
    /** income - spent, the book's actual bottom line. */
    net: PeriodTotals;
}

interface BuildInput {
    /**
     * Every category the book defines. They all get a row, spent on or not - a report
     * that silently omits the categories nobody touched can't answer "what did we not
     * spend on", and a budgeted category dropping out because it went unused is exactly
     * the thing worth seeing.
     */
    allCategories: string[];
    byCategory: SummaryCategory[];
    byCategoryPeriod: SummaryCategoryPeriod[];
    uncategorised: { total: number; count: number };
    uncategorisedByPeriod: { key: string; total: number }[];
    /** Every bucket in the range, in order, straight from `by_period`. */
    byPeriod: SummaryPeriod[];
    budgets: BudgetStatus[];
    rangeFrom: Date;
    rangeTo: Date;
}

/** Categories are matched by name, and a name can be spelled differently across items. */
const key = (name: string) => name.toLowerCase();

export function buildCategoryReport({
    allCategories, byCategory, byCategoryPeriod, uncategorised, uncategorisedByPeriod,
    byPeriod, budgets, rangeFrom, rangeTo,
}: BuildInput): CategoryReport {
    const kept = budgets;
    const periodKeys = byPeriod.map((p) => p.key);
    const pivoted = shouldPivot(periodKeys);

    const registryLabels = new Map(allCategories.map((name) => [key(name), name]));

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

    const budgetedByCategory = new Map<string, { label: string; budgeted: number; kind: BudgetKind }>();
    const spanning: CategoryReportRow[] = [];
    // Which categories carry a cap and which carry a goal, so the totals below can compare
    // each against the spending that actually belongs to it.
    const cappedNames = new Set<string>();
    const goalNames = new Set<string>();
    let wholeBook = 0;
    let totalCapped = 0;
    let totalGoal = 0;
    let hasGoals = false;

    for (const budget of kept) {
        const budgeted = budgetedForRange(
            {
                period: budget.period,
                amount: budget.amount,
                period_from: budget.period_from,
                period_to: budget.period_to,
            },
            rangeFrom, rangeTo,
        );
        if (budgeted <= 0) continue;
        if (budget.kind === "goal") {
            hasGoals = true;
            totalGoal += budgeted;
        } else {
            totalCapped += budgeted;
        }
        for (const name of budget.categories) {
            (budget.kind === "goal" ? goalNames : cappedNames).add(key(name));
        }

        if (budget.categories.length === 0) {
            wholeBook += budgeted;
        } else if (budget.categories.length === 1) {
            const name = budget.categories[0];
            const existing = budgetedByCategory.get(key(name));
            // Two budgets of the same direction on one category add up; opposing ones
            // can't, so the first direction seen holds the cell.
            const sameKind = !existing || existing.kind === budget.kind;
            budgetedByCategory.set(key(name), {
                label: existing?.label ?? name,
                budgeted: sameKind ? (existing?.budgeted ?? 0) + budgeted : (existing?.budgeted ?? 0),
                kind: existing?.kind ?? budget.kind,
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
                kind: budget.kind,
            });
        }
    }

    // Every registered category, plus anything spent on or budgeted that the registry
    // doesn't know about - a CSV import or a rule can name a category before anyone adds
    // it to the book.
    const names = new Set([
        ...registryLabels.keys(),
        ...spentByCategory.keys(),
        ...budgetedByCategory.keys(),
    ]);
    const rows: CategoryReportRow[] = [...names].map((name) => {
        const spend = spentByCategory.get(name);
        const budget = budgetedByCategory.get(name);
        const label = registryLabels.get(name) ?? spend?.label ?? budget?.label ?? name;
        return {
            key: name,
            label,
            categories: [label],
            spent: spend?.spent ?? 0,
            byPeriod: cellsByCategory.get(name) ?? {},
            budgeted: budget?.budgeted,
            kind: budget?.kind,
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

    const columns = pivoted ? periodKeys : [];

    // What each column allows. A bucket is clamped to the range before it is measured:
    // "last 3 months" ends mid-month, and counting that whole month here would leave the
    // columns adding up to more than the total beside them.
    const cappedByPeriod: Record<string, number> = {};
    const goalByPeriod: Record<string, number> = {};
    for (const periodKey of columns) {
        const bucket = periodKeyRange(periodKey);
        if (!bucket) continue;
        const from = new Date(Math.max(bucket.from.getTime(), rangeFrom.getTime()));
        const to = new Date(Math.min(bucket.to.getTime(), rangeTo.getTime()));
        for (const budget of kept) {
            const value = budgetedForRange(
                {
                    period: budget.period,
                    amount: budget.amount,
                    period_from: budget.period_from,
                    period_to: budget.period_to,
                },
                from, to,
            );
            if (value <= 0) continue;
            const target = budget.kind === "goal" ? goalByPeriod : cappedByPeriod;
            target[periodKey] = (target[periodKey] ?? 0) + value;
        }
    }

    const spentByPeriod = fromPeriods(byPeriod, columns, (p) => p.expense);
    const incomeByPeriod = fromPeriods(byPeriod, columns, (p) => p.income);

    const totals = byPeriod.reduce(
        (acc, p) => ({ expense: acc.expense + p.expense, income: acc.income + p.income }),
        { expense: 0, income: 0 },
    );

    // Spending that belongs to each direction, so "Caps left" compares like with like
    // instead of measuring partial coverage against the book's entire outgoings. A
    // whole-book cap covers everything, so it brings all the spending with it.
    const sumOver = (names: Set<string>, all: boolean) => (all
        ? totals.expense
        : [...names].reduce((sum, n) => sum + (spentByCategory.get(n)?.spent ?? 0), 0));
    const cappedSpend = sumOver(cappedNames, wholeBook > 0);
    const goalSaved = sumOver(goalNames, false);

    const cappedSpendByPeriod = wholeBook > 0
        ? spentByPeriod
        : cellsFor(cappedNames, cellsByCategory, columns);

    return {
        rows, spanning, wholeBook,
        totalCapped, totalGoal, cappedSpend, goalSaved,
        hasBudgets: totalCapped > 0 || totalGoal > 0,
        hasGoals,
        periodKeys: columns,
        summary: {
            capped: { byPeriod: cappedByPeriod, total: totalCapped },
            goals: { byPeriod: goalByPeriod, total: totalGoal },
            saved: {
                byPeriod: cellsFor(goalNames, cellsByCategory, columns),
                total: goalSaved,
            },
            spent: { byPeriod: spentByPeriod, total: totals.expense },
            capsLeft: {
                byPeriod: subtract(cappedByPeriod, cappedSpendByPeriod, columns),
                total: totalCapped - cappedSpend,
            },
            income: { byPeriod: incomeByPeriod, total: totals.income },
            net: {
                byPeriod: subtract(incomeByPeriod, spentByPeriod, columns),
                total: totals.income - totals.expense,
            },
        },
    };
}

/** Per-column spend across a set of categories. */
function cellsFor(
    names: Set<string>,
    cellsByCategory: Map<string, Record<string, number>>,
    columns: string[],
): Record<string, number> {
    if (columns.length === 0) return {};
    return Object.fromEntries(columns.map((periodKey) => [
        periodKey,
        [...names].reduce((sum, n) => sum + (cellsByCategory.get(n)?.[periodKey] ?? 0), 0),
    ]));
}

function fromPeriods(
    byPeriod: SummaryPeriod[], columns: string[], pick: (p: SummaryPeriod) => number,
): Record<string, number> {
    if (columns.length === 0) return {};
    const wanted = new Set(columns);
    return Object.fromEntries(
        byPeriod.filter((p) => wanted.has(p.key)).map((p) => [p.key, pick(p)]),
    );
}

function subtract(
    a: Record<string, number>, b: Record<string, number>, columns: string[],
): Record<string, number> {
    return Object.fromEntries(columns.map((k) => [k, (a[k] ?? 0) - (b[k] ?? 0)]));
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
