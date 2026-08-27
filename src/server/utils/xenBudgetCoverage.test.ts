import { describe, it, expect } from "vitest";
import { coverageByMerchant, type CoverageEntry } from "./xenBudgetCoverage";
import type { DraftItem, Rule } from "./xenBudgetRules";
import { FLAG_OFF_BUDGET } from "../constants/xenbudget";

function draft(description: string, over: Partial<DraftItem> = {}): DraftItem {
  return {
    type: "expense",
    amount: 16.99,
    date: new Date("2026-08-15T00:00:00.000Z"),
    description,
    categories: [],
    flags: [],
    applied_rule_ids: [],
    rule_categories: [],
    rule_flags: [],
    source: "csv",
    ...over,
  };
}

function rule(_id: string, contains: string, over: Partial<Rule> = {}): Rule {
  return {
    _id,
    name: _id,
    match: { mode: "all", conditions: [{ field: "description", op: "contains", value: contains }] },
    actions: { set_categories: ["Entertainment"] },
    ...over,
  };
}

/** n items for one merchant, all with the same description. */
const entries = (merchant: string, description: string, n: number): CoverageEntry[] =>
  Array.from({ length: n }, () => ({ merchant, draft: draft(description) }));

describe("coverageByMerchant", () => {
  it("reports a merchant every item of which a rule fires on", () => {
    const coverage = coverageByMerchant(
      entries("NETFLIX COM", "NETFLIX.COM 8829472", 8),
      [rule("r1", "netflix")],
    );
    expect(coverage.get("NETFLIX COM")).toEqual({ matched: 8, total: 8, rule_ids: ["r1"] });
  });

  it("reports a merchant nothing fires on", () => {
    const coverage = coverageByMerchant(
      entries("SOBEYS", "SOBEYS #1120", 5),
      [rule("r1", "netflix")],
    );
    expect(coverage.get("SOBEYS")).toEqual({ matched: 0, total: 5, rule_ids: [] });
  });

  it("counts partial coverage when a rule only fires on some items", () => {
    const coverage = coverageByMerchant(
      [
        ...entries("AMAZON CA", "AMAZON.CA*BIG", 2),
        ...entries("AMAZON CA", "AMAZON.CA*SMALL", 3),
      ],
      [rule("r1", "BIG")],
    );
    expect(coverage.get("AMAZON CA")).toMatchObject({ matched: 2, total: 5, rule_ids: ["r1"] });
  });

  it("does no work at all when the book has no rules", () => {
    const coverage = coverageByMerchant(entries("NETFLIX COM", "NETFLIX.COM", 8), []);
    // Empty rather than a zeroed entry: callers read a missing entry as "none".
    expect(coverage.size).toBe(0);
  });

  it("counts a rule that only adds a flag — any auto tag firing is enough", () => {
    const flagOnly = rule("r1", "netflix", {
      actions: { set_categories: [], add_flags: ["Needs review"] },
    });
    expect(coverageByMerchant(entries("NETFLIX COM", "NETFLIX.COM", 3), [flagOnly]))
      .toEqual(new Map([["NETFLIX COM", { matched: 3, total: 3, rule_ids: ["r1"] }]]));
  });

  it("counts a skip rule, which a sweep turns into off-budget", () => {
    const skipRule = rule("r1", "netflix", { actions: { skip: true } });
    const coverage = coverageByMerchant(entries("NETFLIX COM", "NETFLIX.COM", 3), [skipRule]);
    expect(coverage.get("NETFLIX COM")).toMatchObject({ matched: 3, rule_ids: ["r1"] });
  });

  it("does NOT credit a rule that stop_on_match shadows", () => {
    // r1 runs first and halts evaluation, so r2 never gets to fire even though it matches.
    // A plain "does any rule match" loop would wrongly report both.
    const first = rule("r1", "netflix", { priority: 0, stop_on_match: true });
    const second = rule("r2", "netflix", { priority: 1 });
    const coverage = coverageByMerchant(
      entries("NETFLIX COM", "NETFLIX.COM", 4), [second, first],
    );
    expect(coverage.get("NETFLIX COM")).toEqual({ matched: 4, total: 4, rule_ids: ["r1"] });
  });

  it("ignores a disabled rule", () => {
    const coverage = coverageByMerchant(
      entries("NETFLIX COM", "NETFLIX.COM", 4),
      [rule("r1", "netflix", { enabled: false })],
    );
    // The items are still counted, but nothing fires on them.
    expect(coverage.get("NETFLIX COM")).toEqual({ matched: 0, total: 4, rule_ids: [] });
  });

  it("orders rule_ids by how many items each fired on", () => {
    const coverage = coverageByMerchant(
      [
        ...entries("SHOP", "SHOP ALPHA", 1),
        ...entries("SHOP", "SHOP BETA", 4),
      ],
      // "shop" fires on all five; "beta" on four. Most-hit first, so "shop" leads.
      [rule("broad", "shop"), rule("narrow", "beta")],
    );
    expect(coverage.get("SHOP")).toMatchObject({
      matched: 5, total: 5, rule_ids: ["broad", "narrow"],
    });
  });

  it("evaluates against the pre-rule text, so a renamed row is judged as it arrived", () => {
    // A previous sweep rewrote the description and tagged it. stripRuleEffects restores the
    // original before evaluating, which is what makes this the "fresh import" answer.
    const renamed = draft("Netflix", {
      original_description: "NETFLIX.COM 8829472",
      categories: ["Entertainment"],
      rule_categories: ["Entertainment"],
      applied_rule_ids: ["old-rule"],
    });
    const coverage = coverageByMerchant(
      [{ merchant: "NETFLIX COM", draft: renamed }],
      [rule("r1", "NETFLIX.COM")],
    );
    expect(coverage.get("NETFLIX COM")).toEqual({ matched: 1, total: 1, rule_ids: ["r1"] });
  });

  it("does not carry a stale applied_rule_id into the answer", () => {
    // The item was tagged by a rule that has since been deleted; only the CURRENT rule set
    // may count, or a merchant would look covered by something that no longer exists.
    const stale = draft("SOBEYS #1120", {
      applied_rule_ids: ["deleted-rule"],
      rule_categories: ["Groceries"],
      categories: ["Groceries"],
    });
    const coverage = coverageByMerchant(
      [{ merchant: "SOBEYS", draft: stale }], [rule("r1", "netflix")],
    );
    expect(coverage.get("SOBEYS")).toEqual({ matched: 0, total: 1, rule_ids: [] });
  });

  it("keeps merchants separate", () => {
    const coverage = coverageByMerchant(
      [...entries("NETFLIX COM", "NETFLIX.COM", 3), ...entries("SOBEYS", "SOBEYS #1120", 2)],
      [rule("r1", "netflix")],
    );
    expect(coverage.get("NETFLIX COM")).toMatchObject({ matched: 3, total: 3 });
    expect(coverage.get("SOBEYS")).toMatchObject({ matched: 0, total: 2 });
  });

  it("returns nothing for no entries", () => {
    expect(coverageByMerchant([], [rule("r1", "netflix")]).size).toBe(0);
  });

  it("counts an off-budget rule as firing", () => {
    const offBudget = rule("r1", "netflix", {
      actions: { set_categories: [], add_flags: [FLAG_OFF_BUDGET] },
    });
    expect(coverageByMerchant(entries("NETFLIX COM", "NETFLIX.COM", 2), [offBudget])
      .get("NETFLIX COM")).toMatchObject({ matched: 2, rule_ids: ["r1"] });
  });
});
