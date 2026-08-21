// The XenBudget rules engine.
//
// Deliberately a pure function over plain objects: it is the only substantial piece of
// business logic in this sub-app, it has to behave identically for a manual add, a CSV
// import preview, the import itself and a re-apply sweep, and pure functions are the one
// thing this codebase can actually unit-test (there is no DB or component test harness).
//
// The server is the single source of truth for evaluation. The CSV wizard's preview calls
// an endpoint rather than shipping a second copy of this to the browser, so what the
// preview shows and what the import writes can never drift apart.

export type RuleField = "description" | "amount" | "tags" | "type" | "date" | "source";

export type RuleOp =
  | "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "regex"
  | "gt" | "gte" | "lt" | "lte" | "between" | "is_empty";

export type Disposition = "keep" | "exclude" | "skip";

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value?: string;
  value2?: string;
  case_sensitive?: boolean;
}

export interface RuleActions {
  add_tags?: string[];
  remove_tags?: string[];
  set_type?: "expense" | "income" | null;
  set_people?: string[];
  set_description?: string;
  flag?: boolean;
  flag_reason?: string;
  disposition?: Disposition;
}

export interface Rule {
  _id: string;
  name: string;
  enabled?: boolean;
  priority?: number;
  match: { mode?: "all" | "any"; conditions: RuleCondition[] };
  actions: RuleActions;
  stop_on_match?: boolean;
}

export interface DraftItem {
  type: "expense" | "income";
  amount: number;
  date: Date;
  description: string;
  original_description?: string;
  tags: string[];
  /** Set by a rule's set_people; the caller turns it into resolved shares. */
  people?: string[];
  excluded: boolean;
  excluded_reason?: string;
  flagged: boolean;
  flag_reason?: string;
  /** Which rules touched this item. */
  applied_rule_ids: string[];
  /** Exactly the tags rules contributed, so a re-apply can undo them precisely. */
  rule_tags: string[];
  source?: string;
}

export interface ApplyResult {
  item: DraftItem;
  skipped: boolean;
  skippedByRuleId?: string;
  skippedByRuleName?: string;
}

// A user-supplied pattern is a ReDoS vector. Bounding the length keeps the pathological
// nested-quantifier cases out; anything longer is rejected at rule-save time too, so the
// error surfaces in the form rather than halfway through an import.
export const MAX_REGEX_LENGTH = 200;

function norm(value: string, caseSensitive?: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function asNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asTime(value: string | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Compiles a pattern, treating anything invalid or over-long as a non-match. */
export function safeRegexTest(pattern: string, flags: string, subject: string): boolean {
  if (!pattern || pattern.length > MAX_REGEX_LENGTH) return false;
  try {
    return new RegExp(pattern, flags).test(subject);
  } catch {
    return false;
  }
}

function matchString(op: RuleOp, subject: string, cond: RuleCondition): boolean {
  const value = cond.value ?? "";
  if (op === "is_empty") return subject.trim() === "";
  if (op === "regex") return safeRegexTest(value, cond.case_sensitive ? "" : "i", subject);

  const s = norm(subject, cond.case_sensitive);
  const v = norm(value, cond.case_sensitive);
  switch (op) {
    case "contains": return s.includes(v);
    case "not_contains": return !s.includes(v);
    case "equals": return s === v;
    case "starts_with": return s.startsWith(v);
    case "ends_with": return s.endsWith(v);
    default: return false;
  }
}

function matchNumber(op: RuleOp, subject: number, cond: RuleCondition): boolean {
  const a = asNumber(cond.value);
  const b = asNumber(cond.value2);
  switch (op) {
    case "gt": return a !== null && subject > a;
    case "gte": return a !== null && subject >= a;
    case "lt": return a !== null && subject < a;
    case "lte": return a !== null && subject <= a;
    case "between": return a !== null && b !== null && subject >= Math.min(a, b) && subject <= Math.max(a, b);
    case "equals": return a !== null && subject === a;
    default: return false;
  }
}

function matchCondition(cond: RuleCondition, item: DraftItem): boolean {
  switch (cond.field) {
    case "description":
      return matchString(cond.op, item.description || "", cond);

    case "amount":
      return matchNumber(cond.op, item.amount, cond);

    case "type":
      return cond.op === "equals" && norm(item.type, false) === norm(cond.value ?? "", false);

    case "source":
      return cond.op === "equals" && norm(item.source || "", false) === norm(cond.value ?? "", false);

    case "tags": {
      const tags = item.tags || [];
      if (cond.op === "is_empty") return tags.length === 0;
      const v = norm(cond.value ?? "", cond.case_sensitive);
      const has = tags.some((t) => norm(t, cond.case_sensitive) === v);
      if (cond.op === "not_contains") return !has;
      // "contains" and "equals" both read naturally as "has this tag".
      return has;
    }

    case "date": {
      const subject = item.date instanceof Date ? item.date.getTime() : new Date(item.date).getTime();
      const a = asTime(cond.value);
      const b = asTime(cond.value2);
      switch (cond.op) {
        case "gt": case "gte": return a !== null && subject >= a;
        case "lt": case "lte": return a !== null && subject <= a;
        case "between": return a !== null && b !== null
          && subject >= Math.min(a, b) && subject <= Math.max(a, b);
        default: return false;
      }
    }

    default:
      return false;
  }
}

export function ruleMatches(rule: Rule, item: DraftItem): boolean {
  const conditions = rule.match?.conditions ?? [];
  // A rule with no conditions would match everything, which is never what someone means
  // and is destructive when the action is exclude or skip.
  if (conditions.length === 0) return false;
  return (rule.match?.mode ?? "all") === "any"
    ? conditions.some((c) => matchCondition(c, item))
    : conditions.every((c) => matchCondition(c, item));
}

function addTag(item: DraftItem, tag: string, fromRule: boolean) {
  const clean = tag.trim();
  if (!clean) return;
  if (!item.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
    item.tags.push(clean);
  }
  if (fromRule && !item.rule_tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
    item.rule_tags.push(clean);
  }
}

function removeTag(item: DraftItem, tag: string) {
  const lower = tag.trim().toLowerCase();
  item.tags = item.tags.filter((t) => t.toLowerCase() !== lower);
  item.rule_tags = item.rule_tags.filter((t) => t.toLowerCase() !== lower);
}

export interface ApplyOptions {
  /**
   * Re-apply sweeps set this: a "skip" rule can't retroactively delete an item that
   * already exists, so it degrades to "exclude". Nothing is ever destroyed by a sweep.
   */
  skipBecomesExclude?: boolean;
}

/**
 * Runs the rule set over one draft item, in priority order.
 *
 * Evaluation is **chained**: each rule matches against the item as earlier rules have
 * already left it. That's what lets one rule tag an item "Coffee" and a later one match
 * that tag — but it cuts both ways, and a rule that rewrites the description will stop
 * later rules matching on the bank's original text. Both directions are covered by tests.
 *
 * Returns a new item rather than mutating the input, so a caller can show a before/after
 * preview.
 */
export function applyRules(draft: DraftItem, rules: Rule[], options: ApplyOptions = {}): ApplyResult {
  const item: DraftItem = {
    ...draft,
    tags: [...(draft.tags || [])],
    rule_tags: [...(draft.rule_tags || [])],
    applied_rule_ids: [...(draft.applied_rule_ids || [])],
    people: draft.people ? [...draft.people] : undefined,
  };

  const ordered = rules
    .filter((r) => r.enabled !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const rule of ordered) {
    if (!ruleMatches(rule, item)) continue;

    const actions = rule.actions || {};
    const disposition = actions.disposition ?? "keep";

    if (disposition === "skip" && !options.skipBecomesExclude) {
      return { item, skipped: true, skippedByRuleId: rule._id, skippedByRuleName: rule.name };
    }

    if (!item.applied_rule_ids.includes(rule._id)) item.applied_rule_ids.push(rule._id);

    if (disposition === "exclude" || disposition === "skip") {
      item.excluded = true;
      item.excluded_reason = rule.name;
    }

    (actions.remove_tags || []).forEach((t) => removeTag(item, t));
    (actions.add_tags || []).forEach((t) => addTag(item, t, true));

    if (actions.set_type === "expense" || actions.set_type === "income") {
      item.type = actions.set_type;
    }
    if (actions.set_people && actions.set_people.length > 0) {
      item.people = [...actions.set_people];
    }
    if (actions.set_description && actions.set_description.trim()) {
      // Keep the bank's original text the first time a rule rewrites it, so the change
      // stays auditable and a later reset can put it back.
      if (item.original_description === undefined) item.original_description = draft.description;
      item.description = actions.set_description.trim();
    }
    if (actions.flag) {
      item.flagged = true;
      item.flag_reason = actions.flag_reason || rule.name;
    }

    if (rule.stop_on_match) break;
  }

  return { item, skipped: false };
}

/**
 * Undoes everything rules previously did to an item, so re-applying the current rule set
 * produces the same result as importing the item fresh.
 *
 * This is what makes *deleting* a rule actually reverse its effects. It works off the
 * item's own `rule_tags` rather than looking the rules back up, so it stays correct even
 * when the rule responsible has since been deleted.
 */
export function stripRuleEffects(item: DraftItem): DraftItem {
  const ruleTags = item.rule_tags || [];
  return {
    ...item,
    tags: (item.tags || []).filter(
      (t) => !ruleTags.some((rt) => rt.toLowerCase() === t.toLowerCase()),
    ),
    rule_tags: [],
    applied_rule_ids: [],
    excluded: false,
    excluded_reason: undefined,
    flagged: false,
    flag_reason: undefined,
    description: item.original_description || item.description,
    original_description: item.original_description,
  };
}
