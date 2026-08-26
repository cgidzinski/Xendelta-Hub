import type { SummaryCategoryPeriod } from "../../../../../hooks/xenbudget/types";

/**
 * What changed between the last two periods on the report.
 *
 * The report can already show August and September side by side, but reading two columns
 * of twenty categories and subtracting them in your head is the work it was supposed to
 * save. This does that subtraction and keeps only the categories that actually moved.
 *
 * Built from `by_category_period` (which /summary always returns) rather than from the
 * table's own cells: those are only populated when the table is pivoted into columns
 * (13 or fewer), so deriving from them would make the strip disappear on exactly the wide
 * ranges where it is most useful.
 */

export interface Mover {
    category: string;
    previous: number;
    current: number;
    /** current - previous. Positive means more was spent this period. */
    delta: number;
    /**
     * Change as a fraction of the previous period, or null when there is nothing to
     * divide by — spending that started from zero is new, not "up 100%".
     */
    percent: number | null;
}

export interface Movers {
    previousKey: string;
    currentKey: string;
    /** Biggest increases, largest first. */
    up: Mover[];
    /** Biggest decreases, largest first. */
    down: Mover[];
}

/** How many of each direction are worth showing before it becomes the table again. */
export const MAX_MOVERS = 3;

/**
 * Movement below this is noise: a floor in currency, or a share of what the period spent,
 * whichever is larger. Without it a $0.40 drift in a category nobody thinks about outranks
 * a real change in a quiet month.
 */
const MIN_DELTA = 1;
const MIN_DELTA_SHARE = 0.01;

export function buildMovers(
    byCategoryPeriod: SummaryCategoryPeriod[],
    periodKeys: string[],
    maxMovers = MAX_MOVERS,
): Movers | null {
    if (periodKeys.length < 2) return null;
    const currentKey = periodKeys[periodKeys.length - 1];
    const previousKey = periodKeys[periodKeys.length - 2];

    const totals = new Map<string, { previous: number; current: number }>();
    let currentTotal = 0;
    for (const cell of byCategoryPeriod) {
        if (cell.key !== currentKey && cell.key !== previousKey) continue;
        const row = totals.get(cell.category) ?? { previous: 0, current: 0 };
        if (cell.key === currentKey) {
            row.current += cell.total;
            currentTotal += cell.total;
        } else {
            row.previous += cell.total;
        }
        totals.set(cell.category, row);
    }

    const floor = Math.max(MIN_DELTA, currentTotal * MIN_DELTA_SHARE);

    const movers: Mover[] = [];
    for (const [category, { previous, current }] of totals) {
        const delta = Math.round((current - previous) * 100) / 100;
        if (Math.abs(delta) < floor) continue;
        movers.push({
            category,
            previous,
            current,
            delta,
            percent: previous > 0 ? delta / previous : null,
        });
    }

    return {
        previousKey,
        currentKey,
        up: movers.filter((m) => m.delta > 0)
            .sort((a, b) => b.delta - a.delta).slice(0, maxMovers),
        down: movers.filter((m) => m.delta < 0)
            .sort((a, b) => a.delta - b.delta).slice(0, maxMovers),
    };
}
