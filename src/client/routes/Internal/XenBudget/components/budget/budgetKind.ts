import type { BudgetMeasures } from "../../../../../hooks/xenbudget/types";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

/**
 * Which way an amount points, in one place.
 *
 * A ceiling and a floor are measured identically - same aggregation, same weighted split,
 * same window - and differ only in what crossing the amount MEANS. Keeping that judgement
 * here rather than in each component is what stops the two directions drifting apart:
 * `over` on the wire is the bare fact `spent > amount`, and everything that turns it into
 * a colour or a sentence goes through this module.
 *
 * The direction is deliberately its OWN type rather than the budget's `measures`, because
 * two unrelated things point downward: an income budget, and a savings goal on the Goals
 * page. Keying these on `measures` would force a car fund to describe itself as income to
 * get the right colours. Callers map their own concept onto it - `directionOf` for a
 * budget, the literal "floor" for a goal.
 *
 * Goals share the maths here but bring their own WORDS (see goalProgress.ts): a floor on a
 * category has a target, a named fund has a target of its own, and one formatter serving
 * both is what once made renaming a budget retitle a goal card.
 */

/** Whether the amount is a ceiling not to cross, or a floor to reach. */
export type LimitDirection = "ceiling" | "floor";

/** You want to stay under your expenses and over your income. */
export function directionOf(measures: BudgetMeasures): LimitDirection {
    return measures === "income" ? "floor" : "ceiling";
}

/** Everything at or past this share of a CEILING is worth looking at before the rest. */
export const NEAR_LIMIT_PERCENT = 80;

export type LimitState =
    /** Comfortably inside a ceiling, or a floor still on track. */
    | "ok"
    /** Nearing a ceiling, or a floor that has fallen behind the pace it needs. */
    | "warn"
    /** Past a ceiling. The failure state. */
    | "over"
    /** Reached a floor. The success state. */
    | "met";

/**
 * `pace` is the elapsed fraction of the period, 0-1.
 *
 * A ceiling warns on level: 80% used is worth knowing whatever day it is. A floor can't
 * warn on level, because 40% of the way there is fine on day 12 and hopeless on day 28 -
 * so it warns when progress trails the pace it would need to arrive, which is the same
 * signal measured the only way that means anything for a floor. With no pace to compare
 * against, a floor short of its amount is simply in progress.
 */
export function limitState(
    direction: LimitDirection, percent: number, pace?: number,
): LimitState {
    if (direction === "floor") {
        if (percent >= 100) return "met";
        if (pace !== undefined && percent < pace * 100) return "warn";
        return "ok";
    }
    if (percent > 100) return "over";
    return percent >= NEAR_LIMIT_PERCENT ? "warn" : "ok";
}

/** The colour for a state, or undefined to leave the surrounding text alone. */
export function limitColor(state: LimitState): string | undefined {
    switch (state) {
        case "over": return "error.main";
        case "warn": return "warning.main";
        case "met": return INCOME_COLOR;
        default: return undefined;
    }
}

/**
 * The sentence under a bar.
 *
 * `remaining` is `amount - spent` in both directions, so it is what is left of a ceiling
 * and what is still owed to a floor - the wording is what separates them.
 */
export function limitCaption(
    direction: LimitDirection, remaining: number, percent: number, money: (v: number) => string,
): string {
    if (direction === "floor") {
        return remaining > 0
            ? `${money(remaining)} to go · ${percent}%`
            : `${money(-remaining)} past target · ${percent}%`;
    }
    return remaining < 0
        ? `${money(-remaining)} over · ${percent}%`
        : `${money(remaining)} left · ${percent}%`;
}

/** "of the limit" / "of the target", for screen-reader descriptions. */
export function limitNoun(direction: LimitDirection): string {
    return direction === "floor" ? "target" : "limit";
}

const PERIOD_LABELS: Record<string, string> = {
    weekly: "weekly", monthly: "monthly", quarterly: "quarterly",
    yearly: "yearly", custom: "one-off",
};

/** A budget's period as a word, e.g. "monthly" or "one-off" for a custom range. */
export function periodLabel(period: string): string {
    return PERIOD_LABELS[period] || period;
}

/**
 * Whether running ahead of an even pace is a problem.
 *
 * On a ceiling it is the warning the pace tick exists for; on a floor it means arriving
 * early.
 */
export function aheadIsGood(direction: LimitDirection): boolean {
    return direction === "floor";
}
