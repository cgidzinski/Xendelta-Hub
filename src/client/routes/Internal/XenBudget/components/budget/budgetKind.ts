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
 * two unrelated things point downward: an income budget, and a piggy bank. Keying these
 * on `measures` would force a telescope fund to describe itself as income to get the right
 * colours. Callers map their own concept onto it - `directionOf` for a budget, the literal
 * "floor" for a piggy bank.
 *
 * Piggy banks share the maths here but bring their own WORDS (see piggyBankProgress.ts):
 * one formatter serving both is what once made renaming a budget retitle a bank's card.
 */

/** Whether the amount is a ceiling not to cross, or a floor to reach. */
export type LimitDirection = "ceiling" | "floor";

/**
 * You want to stay under your spending, and over both your income and your saving.
 *
 * Note what this is NOT: the item type a budget counts. `saving` points downward like
 * income but counts expense items - money put away has left your account. Every "is this a
 * floor?" test goes through here rather than checking for "income", which would quietly
 * treat a savings budget as a cap and report being behind on it as comfortable.
 */
export function directionOf(measures: BudgetMeasures): LimitDirection {
    return measures === "expense" ? "ceiling" : "floor";
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

/**
 * What a budget did, once its window has closed.
 *
 * `limitState` above answers "how is this going" and is measured against pace, which is
 * the only question worth asking while a period is still running. The moment the window
 * closes that question stops meaning anything - there is no pace left to keep - and a
 * different one takes over: did it pass? Keeping the two apart is what stops a finished
 * August talking about itself in the present tense forever.
 *
 * Deliberately binary. There is no "passed by a hair" band: 98% and 78% are both simply
 * a pass, and the margin in the caption is there for anyone who wants to know how close
 * it was. Amber stays with the live `warn` state, where it already means "nearing the cap"
 * - a third colour on a settled card would only make the two that matter harder to tell
 * apart.
 */

export type VerdictKey =
    /** The window is still running. `limitState` is the one to ask. */
    | "open"
    /** Inside a ceiling, or a floor that was reached. */
    | "pass"
    /** Past a ceiling, or a floor that fell short. */
    | "miss"
    /** Nothing was counted, so there is nothing to judge. */
    | "quiet";

export interface BudgetVerdict {
    key: VerdictKey;
    /** "Passed", "Missed", "Target met", "No activity", "In progress". */
    word: string;
    /** Undefined for `open` and `quiet`, so surrounding text is left alone. */
    color?: string;
}

/**
 * Whether a window has closed, by the same clock `budgetPace` uses.
 *
 * `periodTo` is exclusive, so a window is closed only once `asOf` has reached it - the
 * instant a month ends is the instant the next begins, and a budget is not finished on
 * its own last day.
 */
export function isSettled(periodTo: string, asOf: string): boolean {
    return new Date(asOf).getTime() >= new Date(periodTo).getTime();
}

/**
 * `itemCount` is what separates a real pass from an empty one. Spending $0 against an
 * $800 cap satisfies it on paper and almost always means the import never ran, so it gets
 * its own neutral state rather than being congratulated - an empty book should never
 * report six passes.
 */
export function budgetVerdict(
    direction: LimitDirection, percent: number, itemCount: number,
    periodTo: string, asOf: string,
): BudgetVerdict {
    if (!isSettled(periodTo, asOf)) {
        return { key: "open", word: "In progress" };
    }
    if (itemCount === 0) {
        return { key: "quiet", word: "No activity" };
    }
    if (direction === "floor") {
        return percent >= 100
            ? { key: "pass", word: "Target met", color: INCOME_COLOR }
            : { key: "miss", word: "Missed", color: "error.main" };
    }
    return percent > 100
        ? { key: "miss", word: "Missed", color: "error.main" }
        : { key: "pass", word: "Passed", color: INCOME_COLOR };
}

/**
 * What a closed window with nothing in it says.
 *
 * Lives here rather than in the component so every place that words a verdict takes it
 * from the same module - the whole point of this file.
 */
export const NO_ACTIVITY_CAPTION = "No activity · nothing to judge";

/**
 * The past-tense twin of `limitCaption`, for a window that has closed.
 *
 * Same figures, same directions, different tense - "$180 left" is a promise about a month
 * that is still ahead of you, and reading it under a finished one is what made a closed
 * budget indistinguishable from a live one at a glance.
 */
export function settledCaption(
    direction: LimitDirection, remaining: number, percent: number, money: (v: number) => string,
): string {
    if (direction === "floor") {
        return remaining <= 0
            ? `Closed ${money(-remaining)} past target · ${percent}%`
            : `Closed ${money(remaining)} short · ${percent}%`;
    }
    return remaining < 0
        ? `Closed ${money(-remaining)} over · ${percent}%`
        : `Closed ${money(remaining)} under · ${percent}%`;
}
