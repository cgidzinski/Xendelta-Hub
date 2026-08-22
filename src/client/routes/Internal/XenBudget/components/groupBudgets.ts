import type { BudgetStatus } from "../../../../hooks/xenbudget/types";

export interface BudgetGroup {
    /** Stable key for React lists. */
    id: string;
    /** Sorted, deduped (case-insensitive) category names. */
    categories: string[];
    personId?: string;
    personName?: string;
    /** The individual budgets sharing this scope — each keeps its own line/progress. */
    budgets: BudgetStatus[];
    /** Alphabetical sort key: category names, the person's name, or "Everything". */
    label: string;
}

function normalizeCategories(categories: string[]): string[] {
    const seen = new Map<string, string>();
    for (const name of categories) {
        const lower = name.toLowerCase();
        if (!seen.has(lower)) seen.set(lower, name);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Groups budgets that cover the same scope — the same person (or everyone) and the exact
 * same set of categories — so they render under one heading on the overview/report, while
 * each budget keeps its own line and progress bar. Groups are ordered alphabetically by
 * category. The budget management page keeps every budget separate.
 */
export function groupBudgets(budgets: BudgetStatus[]): BudgetGroup[] {
    const byKey = new Map<string, BudgetGroup>();

    for (const budget of budgets) {
        const categories = normalizeCategories(budget.categories || []);
        const key = `${budget.person_id ?? ""}\u0000${categories.join("\u0000")}`;
        let group = byKey.get(key);
        if (!group) {
            group = {
                id: key,
                categories,
                personId: budget.person_id,
                personName: budget.person_name,
                budgets: [],
                label: categories.length
                    ? categories.join(", ")
                    : budget.person_name
                        ? budget.person_name
                        : "Everything",
            };
            byKey.set(key, group);
        }
        group.budgets.push(budget);
    }

    const groups = [...byKey.values()];
    groups.sort((a, b) => {
        const byLabel = a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        if (byLabel !== 0) return byLabel;
        const byPerson = (a.personName ?? "").localeCompare(b.personName ?? "", undefined, { sensitivity: "base" });
        if (byPerson !== 0) return byPerson;
        return a.categories.join(", ").localeCompare(b.categories.join(", "), undefined, { sensitivity: "base" });
    });

    return groups;
}
