// The vocabulary of the item list's main filter.
//
// One flat list of option values covering five different things — transaction type,
// need/want, categories, people and flags — because they share one control. Lives here
// rather than in BookItems so the page (which turns a selection into ItemFilters) and the
// menu (which renders it) can never disagree about what an option string means.

import type { XenBudgetBook, XenBudgetMember } from "../../../../hooks/xenbudget/types";
import { FLAG_UNCATEGORISED } from "../../../../constants/xenbudget";

// Synthetic options — not real flags or fields on the item.
export const TYPE_EXPENSE = "__type_expense__";
export const TYPE_INCOME = "__type_income__";
export const NEED_FILTER = "__need__";
export const WANT_FILTER = "__want__";
// Categories are prefixed so a category name can never collide with a flag name in the
// shared list (both registries allow the same string).
export const CATEGORY_PREFIX = "__category__";
// People are prefixed so a member's name can never collide with a category/flag name.
export const PERSON_PREFIX = "__person__";
// Re-exported so the page and the menu keep importing their vocabulary from one module;
// the name itself lives with the other flag constants. Special-cased by the page: it is
// derived from "has no category", so selecting it filters on that state.
export { FLAG_UNCATEGORISED };
export const FLAG_NEEDS_REVIEW = "Needs review";

export type FilterGroup = "Type" | "Need / Want" | "Categories" | "People" | "Flags";

/** The order the groups are listed in, in the menu and in the option list. */
export const FILTER_GROUPS: FilterGroup[] = [
    "Type", "Need / Want", "Categories", "People", "Flags",
];

/** Which section of the menu an option belongs to. Prefixes decide, never the name. */
export function filterGroupOf(option: string): FilterGroup {
    if (option === TYPE_EXPENSE || option === TYPE_INCOME) return "Type";
    if (option === NEED_FILTER || option === WANT_FILTER) return "Need / Want";
    if (option.startsWith(CATEGORY_PREFIX)) return "Categories";
    if (option.startsWith(PERSON_PREFIX)) return "People";
    return "Flags";
}

/**
 * Every option a book offers, in group order.
 *
 * Categories are sorted by name rather than left in registry (i.e. creation) order: a book
 * fed by CSV imports accumulates dozens, and a list nobody can predict the position of has
 * to be read end to end every time. Flags stay in registry order - the built-ins are a
 * short fixed list you learn the shape of, not something you scan alphabetically.
 */
export function buildFilterOptions(book: XenBudgetBook): string[] {
    const categories = book.categories
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [
        TYPE_EXPENSE, TYPE_INCOME, NEED_FILTER, WANT_FILTER,
        ...categories.map((name) => CATEGORY_PREFIX + name),
        ...book.members.map((m) => PERSON_PREFIX + m.user_id),
        ...book.flags.map((f) => f.name),
    ];
}

/**
 * The human label for an option value. People show their username; categories drop the
 * prefix; everything else is a fixed label or the raw flag name.
 */
export function optionLabel(option: string, members: XenBudgetMember[]): string {
    if (option === TYPE_EXPENSE) return "Expenses";
    if (option === TYPE_INCOME) return "Income";
    if (option === NEED_FILTER) return "Need";
    if (option === WANT_FILTER) return "Want";
    if (option.startsWith(CATEGORY_PREFIX)) return option.slice(CATEGORY_PREFIX.length);
    if (option.startsWith(PERSON_PREFIX)) {
        const id = option.slice(PERSON_PREFIX.length);
        return members.find((m) => m.user_id === id)?.username ?? id;
    }
    return option;
}

/**
 * What the filter button reads.
 *
 * The whole point of the button is that it does not grow with the selection — three
 * filters have to share one line on a 360px phone — so this returns a short string at
 * every selection size. On a phone that is the count alone; from sm up there is room to
 * name the first filter, which is the common case of having picked exactly one.
 */
export function summariseFilters(
    selected: string[], labelOf: (option: string) => string, compact: boolean,
): string {
    if (selected.length === 0) return "All";
    if (compact) return String(selected.length);
    const first = labelOf(selected[0]);
    return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}
