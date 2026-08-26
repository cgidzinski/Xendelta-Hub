import type {
    RecurringFrequency, XenBudgetRecurringSeries,
} from "../../../../../hooks/xenbudget/types";

/**
 * Presentation helpers for recurring series, kept out of the component so the date and
 * window arithmetic can be tested — it's the part that's easy to get quietly wrong.
 */

const CADENCE_LABELS: Record<RecurringFrequency, string> = {
    daily: "daily",
    weekly: "weekly",
    biweekly: "every 2 weeks",
    monthly: "monthly",
    quarterly: "quarterly",
    yearly: "yearly",
};

export function cadenceLabel(frequency: RecurringFrequency): string {
    return CADENCE_LABELS[frequency] ?? frequency;
}

/**
 * The most recent price change, but only when it was a RISE and recent enough to still be
 * news. A drop is good news nobody needs chasing, and a rise from two years ago is history
 * rather than something to act on.
 */
export const PRICE_RISE_WINDOW_DAYS = 120;

export function recentPriceRise(
    series: XenBudgetRecurringSeries, now: Date,
): { from: number; to: number; date: string } | null {
    const last = series.price_changes[series.price_changes.length - 1];
    if (!last || last.to <= last.from) return null;
    const ageDays = (now.getTime() - new Date(last.date).getTime()) / 86_400_000;
    return ageDays <= PRICE_RISE_WINDOW_DAYS ? last : null;
}

/**
 * Series whose next charge falls inside [from, to) and hasn't landed yet.
 *
 * This is the double-count guard for the book projection. A recurring charge that has
 * ALREADY posted this period is part of spend-to-date, so adding its amount again would
 * inflate the projection by exactly one month of committed spend. Only a charge still to
 * come may be added — which is precisely what `next_expected` names.
 *
 * "Ended" series are left out: money no longer being paid is not a commitment.
 */
export function commitmentsIn(
    series: XenBudgetRecurringSeries[], from: Date, to: Date,
): XenBudgetRecurringSeries[] {
    return series.filter((s) => {
        if (s.status === "ended") return false;
        const next = new Date(s.next_expected).getTime();
        return next >= from.getTime() && next < to.getTime();
    });
}

/** What the charges still to come in a window add up to. */
export function commitmentTotal(
    series: XenBudgetRecurringSeries[], from: Date, to: Date,
): number {
    return Math.round(
        commitmentsIn(series, from, to).reduce((sum, s) => sum + s.amount, 0) * 100,
    ) / 100;
}
