import type { RuleCoverage, XenBudgetRule } from "../../../../../hooks/xenbudget/types";

/**
 * How much of a merchant an existing auto tag already handles.
 *
 *   none    - nothing fires; offering to make a rule is the right call
 *   partial - a rule fires on some of the items, so a new rule may still be wanted, but
 *             the reader should know something is already here
 *   covered - a rule fires on every item; a second rule would duplicate it
 */
export type CoverageState = "none" | "partial" | "covered";

export function coverageState(coverage?: RuleCoverage): CoverageState {
    // Absent means the book has no rules at all, or the payload predates this field.
    if (!coverage || coverage.matched === 0) return "none";
    // A group with nothing in it must not read as covered — 0 of 0 is vacuously "all",
    // which would hide the wand on a row that no rule has ever seen.
    if (coverage.total === 0) return "none";
    return coverage.matched >= coverage.total ? "covered" : "partial";
}

/**
 * The rules behind a coverage figure, resolved to the ones the book still has.
 *
 * Ids can outlive their rules: the payload is cached, and a rule may have been deleted
 * since. Anything that no longer resolves is dropped rather than shown as a blank name,
 * so a caller can tell "covered by a rule I can open" from "covered by something gone".
 */
export function coverageRules(
    coverage: RuleCoverage | undefined, rules: XenBudgetRule[],
): XenBudgetRule[] {
    return (coverage?.rule_ids ?? [])
        .map((id) => rules.find((r) => r._id === id))
        .filter((r): r is XenBudgetRule => !!r);
}

/** Tooltip text for the row's rule control. */
export function coverageLabel(
    state: CoverageState, coverage: RuleCoverage | undefined, named: XenBudgetRule[],
    merchant: string,
): string {
    const primary = named[0]?.name;
    const others = named.length > 1 ? ` +${named.length - 1} more` : "";

    if (state === "covered") {
        return primary
            ? `Auto-tagged by "${primary}"${others} — open it`
            : "Already auto-tagged";
    }
    if (state === "partial" && coverage) {
        const by = primary ? ` by "${primary}"${others}` : "";
        return `${coverage.matched} of ${coverage.total} already tagged${by}`
            + ` — make a rule for ${merchant}`;
    }
    return `Make a rule for ${merchant}`;
}
