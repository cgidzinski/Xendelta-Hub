import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";

/**
 * The budgets that constrain one member, shaped for a view narrowed to them.
 *
 * A shared limit is kept: it caps this member along with everyone else, so hiding it
 * would understate what they are working against. A budget that only caps OTHER people
 * is dropped, because nothing in it applies to them at all. Within whatever survives,
 * only their own personal limit remains - the card then renders a filtered view without
 * needing to know anything about filtering.
 *
 * Copies rather than editing in place: these budgets come straight out of the React Query
 * cache, which must not be mutated.
 */
export function budgetsForPerson(budgets: BudgetStatus[], personId: string): BudgetStatus[] {
    return budgets
        .map((budget) => ({
            ...budget,
            sub_budgets: budget.sub_budgets.filter((sub) => sub.person_id === personId),
        }))
        .filter((budget) => budget.amount !== undefined || budget.sub_budgets.length > 0);
}

/**
 * One member's prorated slice of a budget's scope this period.
 *
 * Zero covers both "spent nothing" and "not in by_person at all" - the server only emits
 * rows for members who actually contributed, and both cases mean the same thing here.
 */
export function personShare(budget: BudgetStatus, personId: string): number {
    return budget.by_person.find((p) => p.user_id === personId)?.amount ?? 0;
}
