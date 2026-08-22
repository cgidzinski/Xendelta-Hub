import type { BudgetKind } from "../../../../../hooks/xenbudget/types";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

/**
 * Which way a budget's amount points, in one place.
 *
 * A cap and a goal are measured identically - same aggregation, same weighted split, same
 * period window - and differ only in what crossing the amount MEANS. Keeping that
 * judgement here rather than in each component is what stops the two directions drifting
 * apart: `over` on the wire is the bare fact `spent > amount`, and everything that turns
 * it into a colour or a sentence goes through this module.
 */

/** Everything at or past this share of a CAP is worth looking at before the rest. */
export const NEAR_LIMIT_PERCENT = 80;

export type LimitState =
    /** Comfortably inside a cap, or a goal still on track. */
    | "ok"
    /** Nearing a cap, or a goal that has fallen behind the pace it needs. */
    | "warn"
    /** Past a cap. The failure state. */
    | "over"
    /** Reached a goal. The success state. */
    | "met";

/**
 * `pace` is the elapsed fraction of the period, 0-1.
 *
 * A cap warns on level: 80% used is worth knowing whatever day it is. A goal can't warn
 * on level, because 40% saved is fine on day 12 and hopeless on day 28 - so it warns when
 * progress trails the pace it would need to arrive, which is the same signal measured the
 * only way that means anything for a floor. With no pace to compare against, a goal short
 * of its amount is simply in progress.
 */
export function limitState(kind: BudgetKind, percent: number, pace?: number): LimitState {
    if (kind === "goal") {
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
 * `remaining` is `amount - spent` in both directions, so it is what is left of a cap and
 * what is still owed to a goal - the wording is what separates them.
 */
export function limitCaption(
    kind: BudgetKind, remaining: number, percent: number, money: (v: number) => string,
): string {
    if (kind === "goal") {
        return remaining > 0
            ? `${money(remaining)} to go · ${percent}%`
            : `${money(-remaining)} past goal · ${percent}%`;
    }
    return remaining < 0
        ? `${money(-remaining)} over · ${percent}%`
        : `${money(remaining)} left · ${percent}%`;
}

/** "of the limit" / "of the goal", for screen-reader descriptions. */
export function limitNoun(kind: BudgetKind): string {
    return kind === "goal" ? "goal" : "limit";
}

/**
 * Whether spending faster than an even pace is a problem.
 *
 * On a cap it is the warning the pace tick exists for; on a goal it means arriving early.
 */
export function aheadIsGood(kind: BudgetKind): boolean {
    return kind === "goal";
}
