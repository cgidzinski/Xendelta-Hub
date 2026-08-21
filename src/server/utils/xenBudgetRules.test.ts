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
    tags: [],
    excluded: false,
    flagged: false,
    applied_rule_ids: [],
    rule_tags: [],
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

  it("matches on tags, including empty", () => {
    expect(ruleMatches(rule({ match: cond({ field: "tags", op: "is_empty" }) }), draft())).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "tags", op: "is_empty" }) }), draft({ tags: ["food"] }))).toBe(false);
    expect(ruleMatches(rule({ match: cond({ field: "tags", op: "contains", value: "FOOD" }) }), draft({ tags: ["food"] }))).toBe(true);
    expect(ruleMatches(rule({ match: cond({ field: "tags", op: "not_contains", value: "car" }) }), draft({ tags: ["food"] }))).toBe(true);
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
  it("adds tags and records them as rule-contributed", () => {
    const { item } = applyRules(draft(), [rule({ actions: { add_tags: ["Coffee", "Dining"] } })]);
    expect(item.tags).toEqual(["Coffee", "Dining"]);
    expect(item.rule_tags).toEqual(["Coffee", "Dining"]);
    expect(item.applied_rule_ids).toEqual(["r1"]);
  });

  it("does not duplicate a tag the item already has", () => {
    const { item } = applyRules(draft({ tags: ["coffee"] }), [rule({ actions: { add_tags: ["Coffee"] } })]);
    expect(item.tags).toEqual(["coffee"]);
  });

  it("removes tags", () => {
    const { item } = applyRules(draft({ tags: ["food", "coffee"] }), [rule({ actions: { remove_tags: ["FOOD"] } })]);
    expect(item.tags).toEqual(["coffee"]);
  });

  it("flags with the rule name when no reason is given", () => {
    const { item } = applyRules(draft(), [rule({ name: "Big charges", actions: { flag: true } })]);
    expect(item.flagged).toBe(true);
    expect(item.flag_reason).toBe("Big charges");
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
    applyRules(original, [rule({ actions: { add_tags: ["Coffee"], flag: true } })]);
    expect(original.tags).toEqual([]);
    expect(original.flagged).toBe(false);
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
        actions: { add_tags: ["Coffee"] },
      }),
      rule({
        _id: "b", priority: 2,
        match: cond({ field: "tags", op: "contains", value: "Coffee" }),
        actions: { add_tags: ["Discretionary"] },
      }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.tags).toEqual(["Coffee", "Discretionary"]);
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
        actions: { add_tags: ["never applied"] },
      }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.description).toBe("Coffee");
    expect(item.tags).toEqual([]);
    expect(item.applied_rule_ids).toEqual(["a"]);
  });

  it("stops after a rule with stop_on_match", () => {
    const rules = [
      rule({ _id: "a", priority: 1, stop_on_match: true, actions: { add_tags: ["first"] } }),
      rule({ _id: "b", priority: 2, actions: { add_tags: ["second"] } }),
    ];
    const { item } = applyRules(draft(), rules);
    expect(item.tags).toEqual(["first"]);
    expect(item.applied_rule_ids).toEqual(["a"]);
  });

  it("ignores disabled rules", () => {
    const { item } = applyRules(draft(), [rule({ enabled: false, actions: { add_tags: ["nope"] } })]);
    expect(item.tags).toEqual([]);
  });

  it("skips immediately, without applying later rules", () => {
    const rules = [
      rule({ _id: "a", priority: 1, actions: { disposition: "skip" } }),
      rule({ _id: "b", priority: 2, actions: { add_tags: ["later"] } }),
    ];
    const result = applyRules(draft(), rules);
    expect(result.skipped).toBe(true);
    expect(result.item.tags).toEqual([]);
  });
});

describe("re-apply semantics", () => {
  const tagger = rule({ _id: "r1", name: "Coffee", actions: { add_tags: ["Coffee"], flag: true } });

  it("is idempotent — running twice equals running once", () => {
    const once = applyRules(draft(), [tagger]).item;
    const twice = applyRules(stripRuleEffects(once), [tagger]).item;
    expect(twice.tags).toEqual(once.tags);
    expect(twice.rule_tags).toEqual(once.rule_tags);
    expect(twice.applied_rule_ids).toEqual(once.applied_rule_ids);
    expect(twice.flagged).toBe(once.flagged);
  });

  it("reverses a deleted rule's effects", () => {
    const tagged = applyRules(draft(), [tagger]).item;
    expect(tagged.tags).toEqual(["Coffee"]);
    // The rule is gone; a sweep re-applies an empty rule set.
    const swept = applyRules(stripRuleEffects(tagged), []).item;
    expect(swept.tags).toEqual([]);
    expect(swept.flagged).toBe(false);
    expect(swept.applied_rule_ids).toEqual([]);
  });

  it("reverses effects even when the responsible rule can no longer be looked up", () => {
    // stripRuleEffects works off the item's own rule_tags, not the rule list.
    const tagged = applyRules(draft(), [tagger]).item;
    const stripped = stripRuleEffects(tagged);
    expect(stripped.tags).toEqual([]);
    expect(stripped.rule_tags).toEqual([]);
  });

  it("keeps tags the user added by hand while removing the rule's", () => {
    const manual = draft({ tags: ["mine"] });
    const tagged = applyRules(manual, [tagger]).item;
    expect(tagged.tags).toEqual(["mine", "Coffee"]);
    expect(stripRuleEffects(tagged).tags).toEqual(["mine"]);
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
