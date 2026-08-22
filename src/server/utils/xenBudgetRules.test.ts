import { describe, it, expect } from "vitest";
import {
  applyRules, ruleMatches, stripRuleEffects, safeRegexTest, MAX_REGEX_LENGTH,
  type Rule, type DraftItem, type RuleCondition,
} from "./xenBudgetRules";

function draft(over: Partial<DraftItem> = {}): DraftItem {
  return {
    type: "expense",
    amount: 42.1,
    date: new Date("2026-08-21T12:00:00.000Z"),
    description: "STARBUCKS #1234",
    categories: [],
    flags: [],
    excluded: false,
    applied_rule_ids: [],
    rule_categories: [],
    rule_flags: [],
    source: "csv",
    ...over,
  };
}

function rule(over: Partial<Rule> = {}): Rule {
  return {
    _id: over._id || "r1",
    name: over.name || "Rule",
    match: over.match || { mode: "all", conditions: [{ field: "description", op: "contains", value: "starbucks" }] },
    actions: over.actions || {},
    enabled: over.enabled,
    priority: over.priority,
    stop_on_match: over.stop_on_match,
  };
}

const cond = (c: RuleCondition): Rule["match"] => ({ mode: "all", conditions: [c] });

describe("condition matching", () => {
  it("is case-insensitive by default", () => {
    expect(ruleMatches(rule({ match: cond({ field: "description", op: "contains", value: "starbucks" }) }), draft())).toBe(true);
  });

  it("respects case_sensitive when asked", () => {
    const r = rule({ match: cond({ field: "description", op: "contains", value: "starbucks", case_sensitive: true }) });
    expect(ruleMatches(r, draft())).toBe(false);
    expect(ruleMatches(r, draft({ description: "starbucks run" }))).toBe(true);
  });

  it("handles every string operator", () => {
    const d = draft({ description: "STARBUCKS #1234" });
    const check = (op: any, value: string) => ruleMatches(rule({ match: cond({ field: "description", op, value }) }), d);
    expect(check("equals", "starbucks #1234")).toBe(true);
    expect(check("equals", "starbucks")).toBe(false);
    expect(check("starts_with", "star")).toBe(true);
    expect(check("ends_with", "1234")).toBe(true);
    expect(check("not_contains", "tesco")).toBe(true);
    expect(check("not_contains", "starbucks")).toBe(false);
    expect(check("regex", "^STAR.*\\d+$")).toBe(true);
  });

  it("handles numeric comparison on amount", () => {
    const check = (op: any, value: string, value2?: string) =>
      ruleMatches(rule({ match: cond({ field: "amount", op, value, value2 }) }), draft({ amount: 500 }));
    expect(check("gt", "499")).toBe(true);
    expect(check("gt", "500")).toBe(false);
    expect(check("gte", "500")).toBe(true);
    expect(check("lt", "501")).toBe(true);
    expect(check("lte", "500")).toBe(true);
    expect(check("equals", "500")).toBe(true);
    expect(check("between", "100", "600")).toBe(true);
    expect(check("between", "600", "100")).toBe(true);   // order-insensitive
    expect(check("between", "600", "900")).toBe(false);
  });

  it("treats an unparseable comparison value as a non-match rather than throwing", () => {
    expect(ruleMatches(rule({ match: cond({ field: "amount", op: "gt", value: "abc" }) }), draft())).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "amount", op: "gt", value: "" }) }), draft())).toBe(false);
  });

  it("matches on flags, including empty", () => {
    expect(ruleMatches(rule({ match: cond({ field: "flags", op: "is_empty" }) }), draft())).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "flags", op: "is_empty" }) }), draft({ flags: ["food"] }))).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "flags", op: "contains", value: "FOOD" }) }), draft({ flags: ["food"] }))).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "flags", op: "not_contains", value: "car" }) }), draft({ flags: ["food"] }))).toBe(true);
  });

  it("matches on category the same way it matches on flags", () => {
    const d = draft({ categories: ["Groceries"] });
    expect(ruleMatches(rule({ match: cond({ field: "category", op: "contains", value: "groceries" }) }), d)).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "category", op: "not_contains", value: "rent" }) }), d)).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "category", op: "is_empty" }) }), d)).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "category", op: "is_empty" }) }), draft())).toBe(true);
  });

  it("matches on type, source and date", () => {
    expect(ruleMatches(rule({ match: cond({ field: "type", op: "equals", value: "expense" }) }), draft())).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "source", op: "equals", value: "csv" }) }), draft())).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "date", op: "gte", value: "2026-08-01" }) }), draft())).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "date", op: "lt", value: "2026-08-01" }) }), draft())).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "date", op: "between", value: "2026-08-01", value2: "2026-08-31" }) }), draft())).toBe(true);
  });

  it("requires all conditions in \"all\" mode and any in \"any\" mode", () => {
    const conditions: RuleCondition[] = [
      { field: "description", op: "contains", value: "starbucks" },
      { field: "amount", op: "gt", value: "1000" },
    ];
    expect(ruleMatches(rule({ match: { mode: "all", conditions } }), draft())).toBe(false);
    expect(ruleMatches(rule({ match: { mode: "any", conditions } }), draft())).toBe(true);
  });

  it("never matches a rule with no conditions", () => {
    // Matching everything is never what someone means, and is destructive when the
    // action is exclude or skip.
    expect(ruleMatches(rule({ match: { mode: "all", conditions: [] } }), draft())).toBe(false);
    expect(ruleMatches(rule({ match: { mode: "any", conditions: [] } }), draft())).toBe(false);
  });
});

describe("regex safety", () => {
  it("treats a malformed pattern as a non-match instead of throwing", () => {
    expect(() => safeRegexTest("([a-z", "i", "abc")).not.toThrow();
    expect(safeRegexTest("([a-z", "i", "abc")).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "description", op: "regex", value: "([unclosed" }) }), draft())).toBe(false);
  });

  it("refuses a pattern longer than the cap", () => {
    expect(safeRegexTest("a".repeat(MAX_REGEX_LENGTH + 1), "i", "a".repeat(50))).toBe(false);
    expect(safeRegexTest("a".repeat(10), "i", "a".repeat(50))).toBe(true);
  });

  it("treats an empty pattern as a non-match", () => {
    expect(safeRegexTest("", "i", "anything")).toBe(false);
  });
});

describe("actions", () => {
  it("adds flags and records them as rule-contributed", () => {
    const { item } = applyRules(draft(), [rule({ actions: { add_flags: ["Coffee", "Dining"] } })]);
    expect(item.flags).toEqual(["Coffee", "Dining"]);
    expect(item.rule_flags).toEqual(["Coffee", "Dining"]);
    expect(item.applied_rule_ids).toEqual(["r1"]);
  });

  it("does not duplicate a flag the item already has", () => {
    const { item } = applyRules(draft({ flags: ["coffee"] }), [rule({ actions: { add_flags: ["Coffee"] } })]);
    expect(item.flags).toEqual(["coffee"]);
  });

  it("removes flags", () => {
    const { item } = applyRules(draft({ flags: ["food", "coffee"] }), [rule({ actions: { remove_flags: ["FOOD"] } })]);
    expect(item.flags).toEqual(["coffee"]);
  });

  it("adds an attention flag, which is what the old flag action became", () => {
    const { item } = applyRules(draft(), [rule({ name: "Big charges", actions: { add_flags: ["Needs review"] } })]);
    expect(item.flags).toEqual(["Needs review"]);
    expect(item.rule_flags).toEqual(["Needs review"]);
  });

  it("sets categories, replacing rather than appending", () => {
    // "this is a grocery run" is a statement about what the purchase was, not one more
    // label to pile on top of whatever was there.
    const { item } = applyRules(
      draft({ categories: ["Misc"] }),
      [rule({ actions: { set_categories: ["Groceries", "Household"] } })],
    );
    expect(item.categories).toEqual(["Groceries", "Household"]);
    expect(item.rule_categories).toEqual(["Groceries", "Household"]);
  });

  it("keeps categories and flags apart", () => {
    const { item } = applyRules(draft(), [rule({
      actions: { set_categories: ["Dining"], add_flags: ["check receipt"] },
    })]);
    expect(item.categories).toEqual(["Dining"]);
    expect(item.flags).toEqual(["check receipt"]);
  });

  it("sets type and people", () => {
    const { item } = applyRules(draft(), [rule({ actions: { set_type: "income", set_people: ["u1", "u2"] } })]);
    expect(item.type).toBe("income");
    expect(item.people).toEqual(["u1", "u2"]);
  });

  it("keeps the bank's original text when rewriting the description", () => {
    const { item } = applyRules(draft(), [rule({ actions: { set_description: "Coffee" } })]);
    expect(item.description).toBe("Coffee");
    expect(item.original_description).toBe("STARBUCKS #1234");
  });

  it("excludes without destroying, recording which rule was responsible", () => {
    const { item, skipped } = applyRules(draft(), [rule({ name: "Internal transfers", actions: { disposition: "exclude" } })]);
    expect(skipped).toBe(false);
    expect(item.excluded).toBe(true);
    expect(item.excluded_reason).toBe("Internal transfers");
  });

  it("skips outright, naming the responsible rule so it isn't silent", () => {
    const result = applyRules(draft(), [rule({ name: "Card payments", actions: { disposition: "skip" } })]);
    expect(result.skipped).toBe(true);
    expect(result.skippedByRuleName).toBe("Card payments");
    expect(result.skippedByRuleId).toBe("r1");
  });

  it("does not mutate the input draft", () => {
    const original = draft();
    applyRules(original, [rule({ actions: { set_categories: ["Dining"], add_flags: ["Coffee"] } })]);
    expect(original.flags).toEqual([]);
    expect(original.categories).toEqual([]);
  });
});

describe("ordering", () => {
  it("runs rules in priority order, last write winning", () => {
    // Both match on amount, so neither rule's edits can affect the other's condition.
    const byAmount = cond({ field: "amount", op: "gt", value: "1" });
    const rules = [
      rule({ _id: "b", priority: 2, match: byAmount, actions: { set_description: "second" } }),
      rule({ _id: "a", priority: 1, match: byAmount, actions: { set_description: "first" } }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.description).toBe("second");
    expect(item.applied_rule_ids).toEqual(["a", "b"]);
    // The rewrite stays auditable back to the bank's text, not to the intermediate value.
    expect(item.original_description).toBe("STARBUCKS #1234");
  });

  it("chains: a later rule sees what earlier rules changed", () => {
    const rules = [
      rule({
        _id: "a", priority: 1,
        match: cond({ field: "description", op: "contains", value: "starbucks" }),
        actions: { add_flags: ["Coffee"] },
      }),
      rule({
        _id: "b", priority: 2,
        match: cond({ field: "flags", op: "contains", value: "Coffee" }),
        actions: { add_flags: ["Discretionary"] },
      }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.flags).toEqual(["Coffee", "Discretionary"]);
  });

  it("chains the other way too: a rewrite can stop a later rule from matching", () => {
    // Worth pinning down, because it is the surprising half of chained evaluation — a
    // rule that renames the payee will stop later rules that match on the old text.
    const rules = [
      rule({
        _id: "a", priority: 1,
        match: cond({ field: "description", op: "contains", value: "starbucks" }),
        actions: { set_description: "Coffee" },
      }),
      rule({
        _id: "b", priority: 2,
        match: cond({ field: "description", op: "contains", value: "starbucks" }),
        actions: { add_flags: ["never applied"] },
      }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.description).toBe("Coffee");
    expect(item.flags).toEqual([]);
    expect(item.applied_rule_ids).toEqual(["a"]);
  });

  it("stops after a rule with stop_on_match", () => {
    const rules = [
      rule({ _id: "a", priority: 1, stop_on_match: true, actions: { add_flags: ["first"] } }),
      rule({ _id: "b", priority: 2, actions: { add_flags: ["second"] } }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.flags).toEqual(["first"]);
    expect(item.applied_rule_ids).toEqual(["a"]);
  });

  it("ignores disabled rules", () => {
    const { item } = applyRules(draft(), [rule({ enabled: false, actions: { add_flags: ["nope"] } })]);
    expect(item.flags).toEqual([]);
  });

  it("skips immediately, without applying later rules", () => {
    const rules = [
      rule({ _id: "a", priority: 1, actions: { disposition: "skip" } }),
      rule({ _id: "b", priority: 2, actions: { add_flags: ["later"] } }),
    ];
    const result = applyRules(draft(), rules);
    expect(result.skipped).toBe(true);
    expect(result.item.flags).toEqual([]);
  });
});

describe("re-apply semantics", () => {
  const flagger = rule({
    _id: "r1", name: "Coffee",
    actions: { set_categories: ["Dining"], add_flags: ["check receipt"] },
  });

  it("is idempotent — running twice equals running once", () => {
    const once = applyRules(draft(), [flagger]).item;
    const twice = applyRules(stripRuleEffects(once), [flagger]).item;
    expect(twice.categories).toEqual(once.categories);
    expect(twice.flags).toEqual(once.flags);
    expect(twice.rule_categories).toEqual(once.rule_categories);
    expect(twice.rule_flags).toEqual(once.rule_flags);
    expect(twice.applied_rule_ids).toEqual(once.applied_rule_ids);
  });

  it("reverses a deleted rule's effects", () => {
    const flagged = applyRules(draft(), [flagger]).item;
    expect(flagged.categories).toEqual(["Dining"]);
    expect(flagged.flags).toEqual(["check receipt"]);
    // The rule is gone; a sweep re-applies an empty rule set.
    const swept = applyRules(stripRuleEffects(flagged), []).item;
    expect(swept.categories).toEqual([]);
    expect(swept.flags).toEqual([]);
    expect(swept.applied_rule_ids).toEqual([]);
  });

  it("reverses categories and flags independently", () => {
    // Deleting a categorising rule must not strip an attention flag another rule added,
    // and vice versa — which is why the two are tracked separately.
    const categoriser = rule({ _id: "cat", priority: 1, actions: { set_categories: ["Dining"] } });
    const attention = rule({ _id: "att", priority: 2, actions: { add_flags: ["check receipt"] } });
    const both = applyRules(draft(), [categoriser, attention]).item;
    expect(both.categories).toEqual(["Dining"]);
    expect(both.flags).toEqual(["check receipt"]);

    // The categorising rule is deleted; the attention one survives.
    const swept = applyRules(stripRuleEffects(both), [attention]).item;
    expect(swept.categories).toEqual([]);
    expect(swept.flags).toEqual(["check receipt"]);
  });

  it("reverses effects even when the responsible rule can no longer be looked up", () => {
    // stripRuleEffects works off the item's own rule_flags, not the rule list.
    const flagged = applyRules(draft(), [flagger]).item;
    const stripped = stripRuleEffects(flagged);
    expect(stripped.flags).toEqual([]);
    expect(stripped.rule_flags).toEqual([]);
  });

  it("keeps flags the user added by hand while removing the rule's", () => {
    const manual = draft({ flags: ["mine"] });
    const flagged = applyRules(manual, [flagger]).item;
    expect(flagged.flags).toEqual(["mine", "check receipt"]);
    expect(stripRuleEffects(flagged).flags).toEqual(["mine"]);
  });

  it("restores a rewritten description", () => {
    const renamed = applyRules(draft(), [rule({ actions: { set_description: "Coffee" } })]).item;
    expect(stripRuleEffects(renamed).description).toBe("STARBUCKS #1234");
  });

  it("degrades skip to exclude on a sweep, so nothing is destroyed", () => {
    const skipper = rule({ name: "Card payments", actions: { disposition: "skip" } });
    const result = applyRules(draft(), [skipper], { skipBecomesExclude: true });
    expect(result.skipped).toBe(false);
    expect(result.item.excluded).toBe(true);
    expect(result.item.excluded_reason).toBe("Card payments");
  });
});
