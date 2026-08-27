// Which existing rules would fire on a group of items.
//
// Pure, and separate from xenBudgetRecurring.ts because that module must stay rule-unaware:
// detection is about what the bank did, this is about what the book would do to it.
//
// The caller converts stored items into DraftItems (routes/xenbudget.ts owns toDraft) and
// says which merchant each belongs to; everything here is arithmetic over the rules engine.

import { applyRules, stripRuleEffects, type DraftItem, type Rule } from "./xenBudgetRules";

/** What one merchant's items would do if they were imported again right now. */
export interface MerchantRuleCoverage {
  /** Items an existing rule fires on. */
  matched: number;
  /** Items considered. */
  total: number;
  /** Rules that fired, most items first. Names are resolved by the client from book.rules. */
  rule_ids: string[];
}

export interface CoverageEntry {
  merchant: string;
  draft: DraftItem;
}

/**
 * Coverage per merchant.
 *
 * Answers a FUTURE-tense question — "will an auto tag already tag this?" — so it evaluates
 * the current rule set rather than reading applied_rule_ids off the stored items. Those ids
 * are stale for any rule added since the last re-apply sweep, which is exactly the
 * situation someone is in when they reach for "make a rule".
 *
 * Strip-then-apply is the sequence /rules/reapply uses, and that is the point: it IS the
 * definition of what a fresh import would do, so it honours priority order, stop_on_match
 * and skip for free. A hand-rolled "does any rule match" loop would credit a rule that
 * never actually gets to run.
 *
 * A rule firing at all counts, whether it sets a category, adds a flag or marks the row
 * off-budget. Any of those means an auto tag already has an opinion about this merchant,
 * and a second rule would duplicate it.
 */
export function coverageByMerchant(
  entries: CoverageEntry[], rules: Rule[],
): Map<string, MerchantRuleCoverage> {
  const coverage = new Map<string, MerchantRuleCoverage>();
  // A book with no rules is the common case: every merchant is uncovered and there is
  // nothing to evaluate. Callers read a missing entry as "none".
  if (rules.length === 0) return coverage;

  const hitsByMerchant = new Map<string, Map<string, number>>();

  for (const { merchant, draft } of entries) {
    const entry = coverage.get(merchant) ?? { matched: 0, total: 0, rule_ids: [] };
    entry.total += 1;

    // skipBecomesOffBudget mirrors the sweep: a "skip" rule can't retroactively delete an
    // item that already exists, and here nothing is being written at all — what matters is
    // only that the rule is recorded as having fired.
    const { item: after } = applyRules(
      stripRuleEffects(draft), rules, { skipBecomesOffBudget: true },
    );
    if (after.applied_rule_ids.length > 0) {
      entry.matched += 1;
      const perRule = hitsByMerchant.get(merchant) ?? new Map<string, number>();
      for (const id of after.applied_rule_ids) perRule.set(id, (perRule.get(id) ?? 0) + 1);
      hitsByMerchant.set(merchant, perRule);
    }
    coverage.set(merchant, entry);
  }

  // Most-hit first, so the UI can name one rule as the merchant's owner rather than
  // whichever happened to be evaluated first.
  for (const [merchant, perRule] of hitsByMerchant) {
    const entry = coverage.get(merchant);
    if (entry) {
      entry.rule_ids = [...perRule.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    }
  }

  return coverage;
}
