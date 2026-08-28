import { describe, it, expect } from "vitest";
import {
    CATEGORY_PREFIX, PERSON_PREFIX, TYPE_EXPENSE, TYPE_INCOME, NEED_FILTER, WANT_FILTER,
    FLAG_UNCATEGORISED, filterGroupOf, optionLabel, summariseFilters,
} from "./itemFilterOptions";
import type { XenBudgetMember } from "../../../../hooks/xenbudget/types";

const members: XenBudgetMember[] = [
    { user_id: "u1", username: "ada", avatar: null },
    { user_id: "u2", username: "grace", avatar: null },
];

describe("filterGroupOf", () => {
    it("places each synthetic option in its own group", () => {
        expect(filterGroupOf(TYPE_EXPENSE)).toBe("Type");
        expect(filterGroupOf(TYPE_INCOME)).toBe("Type");
        expect(filterGroupOf(NEED_FILTER)).toBe("Need / Want");
        expect(filterGroupOf(WANT_FILTER)).toBe("Need / Want");
    });

    it("groups by prefix, so a flag name is only ever a flag", () => {
        expect(filterGroupOf(CATEGORY_PREFIX + "Groceries")).toBe("Categories");
        expect(filterGroupOf(PERSON_PREFIX + "u1")).toBe("People");
        expect(filterGroupOf(FLAG_UNCATEGORISED)).toBe("Flags");
    });

    it("keeps a category named after a flag on the categories side", () => {
        // The prefix decides, not the name — both registries allow the same string.
        expect(filterGroupOf(CATEGORY_PREFIX + FLAG_UNCATEGORISED)).toBe("Categories");
    });
});

describe("optionLabel", () => {
    it("names the synthetic options", () => {
        expect(optionLabel(TYPE_EXPENSE, members)).toBe("Expenses");
        expect(optionLabel(TYPE_INCOME, members)).toBe("Income");
        expect(optionLabel(NEED_FILTER, members)).toBe("Need");
        expect(optionLabel(WANT_FILTER, members)).toBe("Want");
    });

    it("strips the category prefix and resolves a person to their username", () => {
        expect(optionLabel(CATEGORY_PREFIX + "Groceries", members)).toBe("Groceries");
        expect(optionLabel(PERSON_PREFIX + "u2", members)).toBe("grace");
    });

    it("falls back to the id for a member who has since left the book", () => {
        expect(optionLabel(PERSON_PREFIX + "gone", members)).toBe("gone");
    });

    it("passes a flag through as-is", () => {
        expect(optionLabel(FLAG_UNCATEGORISED, members)).toBe("Uncategorised");
    });
});

describe("summariseFilters", () => {
    const label = (o: string) => optionLabel(o, members);

    it("reads 'All' with nothing selected, at either width", () => {
        expect(summariseFilters([], label, true)).toBe("All");
        expect(summariseFilters([], label, false)).toBe("All");
    });

    it("is the count alone on a phone", () => {
        expect(summariseFilters([TYPE_EXPENSE], label, true)).toBe("1");
        expect(summariseFilters(
            [TYPE_EXPENSE, CATEGORY_PREFIX + "Groceries", PERSON_PREFIX + "u1"], label, true,
        )).toBe("3");
    });

    it("names the one filter from sm up", () => {
        expect(summariseFilters([CATEGORY_PREFIX + "Groceries"], label, false)).toBe("Groceries");
    });

    it("names the first and counts the rest from sm up", () => {
        expect(summariseFilters(
            [CATEGORY_PREFIX + "Groceries", TYPE_EXPENSE, FLAG_UNCATEGORISED], label, false,
        )).toBe("Groceries +2");
    });
});
