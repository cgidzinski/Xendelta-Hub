import type { BudgetPeriodResult } from "../../../../../hooks/xenbudget/types";
import type { LimitDirection } from "./budgetKind";

/**
 * A run of closed periods, turned into the two things a strip needs: a signed margin per
 * column, and the record they add up to.
 *
 * The sign is normalized so POSITIVE always means the good direction - under a cap, past a
 * target - which is what lets one bar component serve both. Without that the floor case
 * would have to draw itself upside down, and the "4 of 6 passed" sentence would have to
 * carry its own copy of which way is good.
 */

export interface HistoryColumn {
    /** The window this column covers, for its label. */
    from: string;
    to: string;
    /** Signed so positive is always the good direction. Undefined when nothing to judge. */
    margin?: number;
    /** True when the period had no items - drawn flat, and left out of the record. */
    quiet: boolean;
    /** Undefined for a quiet column. */
    passed?: boolean;
    /** The period still in progress: measured, but not yet a result. */
    open: boolean;
}

export interface HistorySummary {
    columns: HistoryColumn[];
    passed: number;
    /** Closed periods with something in them. Quiet and in-progress ones don't count. */
    judged: number;
    /** Consecutive passes ending at the most recent CLOSED period. */
    streak: number;
    /** The largest absolute margin, for scaling the bars. Never zero. */
    peak: number;
}

/**
 * `asOf` decides which of the trailing periods is still open. It is always the last one -
 * `previousPeriodRanges` ends with the window `asOf` falls in - but it is read off the
 * dates rather than assumed, so a stale response can't draw a live month as a result.
 */
export function historyMargins(
    periods: BudgetPeriodResult[], direction: LimitDirection, asOf: string,
): HistorySummary {
    const now = new Date(asOf).getTime();

    const columns: HistoryColumn[] = periods.map((p) => {
        const open = new Date(p.to).getTime() > now;
        // No amount means the budget caps only named people, so a whole-budget column has
        // nothing to be measured against.
        if (p.amount === undefined) {
            return { from: p.from, to: p.to, quiet: true, open };
        }
        const under = p.amount - p.spent;
        const margin = direction === "floor" ? -under : under;
        const quiet = p.item_count === 0;
        return {
            from: p.from,
            to: p.to,
            margin,
            quiet,
            passed: quiet || open ? undefined : margin >= 0,
            open,
        };
    });

    const closed = columns.filter((c) => !c.open && !c.quiet && c.passed !== undefined);
    const passed = closed.filter((c) => c.passed).length;

    let streak = 0;
    for (let i = closed.length - 1; i >= 0 && closed[i].passed; i--) streak++;

    const peak = Math.max(
        1,
        ...columns.map((c) => (c.margin === undefined ? 0 : Math.abs(c.margin))),
    );

    return { columns, passed, judged: closed.length, streak, peak };
}

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A column's heading, short enough to sit under a 30px bar.
 *
 * Read off the window's LENGTH rather than the budget's `period` value, so the labels stay
 * right without threading the period down beside the data - a week gets a date, a month
 * its name, anything longer the year it starts in.
 */
export function columnLabel(from: string, to: string): string {
    const f = new Date(from);
    const days = (new Date(to).getTime() - f.getTime()) / 86400000;
    if (days <= 8) return `${MONTHS[f.getUTCMonth()]} ${f.getUTCDate()}`;
    if (days <= 32) return MONTHS[f.getUTCMonth()];
    if (days <= 100) return `Q${Math.floor(f.getUTCMonth() / 3) + 1}`;
    return String(f.getUTCFullYear());
}
