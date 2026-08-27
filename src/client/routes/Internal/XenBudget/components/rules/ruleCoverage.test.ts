import { describe, it, expect } from "vitest";
import { coverageState, coverageRules, coverageLabel } from "./ruleCoverage";
import type { RuleCoverage, XenBudgetRule } from "../../../../../hooks/xenbudget/types";

const rule = (id: string, name: string): XenBudgetRule => ({
    _id: id,
    name,
    enabled: true,
    priority: 0,
    match: { mode: "all", conditions: [] },
    actions: {
        set_categories: [], add_flags: [], remove_flags: [],
        set_type: null, set_people: [], skip: false,
    },
    stop_on_match: false,
});

const coverage = (over: Partial<RuleCoverage> = {}): RuleCoverage =>
    ({ matched: 0, total: 0, rule_ids: [], ...over });

describe("coverageState", () => {
    it("is none when nothing fires", () => {
        expect(coverageState(coverage({ matched: 0, total: 12 }))).toBe("none");
    });

    it("is none when the field is absent — a book with no rules, or an older payload", () => {
        expect(coverageState(undefined)).toBe("none");
    });

    it("is covered when a rule fires on every item", () => {
        expect(coverageState(coverage({ matched: 12, total: 12 }))).toBe("covered");
    });

    it("is partial when a rule fires on some of them", () => {
        expect(coverageState(coverage({ matched: 5, total: 12 }))).toBe("partial");
    });

    it("does not read an empty group as covered", () => {
        // 0 of 0 is vacuously "all" — it must not hide the wand on a row no rule has seen.
        expect(coverageState(coverage({ matched: 0, total: 0 }))).toBe("none");
    });

    it("tolerates matched exceeding total rather than reading it as partial", () => {
        expect(coverageState(coverage({ matched: 13, total: 12 }))).toBe("covered");
    });
});

describe("coverageRules", () => {
    const rules = [rule("r1", "Netflix"), rule("r2", "Subscriptions")];

    it("resolves ids to rules, keeping the server's most-hit-first order", () => {
        const named = coverageRules(coverage({ rule_ids: ["r2", "r1"] }), rules);
        expect(named.map((r) => r.name)).toEqual(["Subscriptions", "Netflix"]);
    });

    it("drops an id whose rule has since been deleted", () => {
        const named = coverageRules(coverage({ rule_ids: ["r1", "gone"] }), rules);
        expect(named.map((r) => r.name)).toEqual(["Netflix"]);
    });

    it("returns nothing for absent coverage", () => {
        expect(coverageRules(undefined, rules)).toEqual([]);
    });
});

describe("coverageLabel", () => {
    const netflix = rule("r1", "Netflix");

    it("names the rule to open when fully covered", () => {
        expect(coverageLabel("covered", coverage({ matched: 8, total: 8 }), [netflix], "NETFLIX COM"))
            .toBe('Auto-tagged by "Netflix" — open it');
    });

    it("counts the extra rules rather than listing them all", () => {
        const label = coverageLabel(
            "covered", coverage({ matched: 8, total: 8 }),
            [netflix, rule("r2", "Subscriptions"), rule("r3", "Cards")], "NETFLIX COM",
        );
        expect(label).toBe('Auto-tagged by "Netflix" +2 more — open it');
    });

    it("falls back when covered by a rule that no longer resolves", () => {
        expect(coverageLabel("covered", coverage({ matched: 8, total: 8 }), [], "NETFLIX COM"))
            .toBe("Already auto-tagged");
    });

    it("gives both the count and the action when partial", () => {
        expect(coverageLabel("partial", coverage({ matched: 3, total: 8 }), [netflix], "AMAZON CA"))
            .toBe('3 of 8 already tagged by "Netflix" — make a rule for AMAZON CA');
    });

    it("is a plain invitation when nothing covers it", () => {
        expect(coverageLabel("none", undefined, [], "SOBEYS"))
            .toBe("Make a rule for SOBEYS");
    });
});
