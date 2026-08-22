/**
 * Where a budget SHOULD be, part-way through its period.
 *
 * "$180 left" reads fine on the 28th and hides a problem on the 3rd. Spreading the limit
 * evenly across the window and comparing gives the number that actually answers "am I
 * going to make it" - and it needs no extra query, since /budget-status already returns
 * the window it measured.
 */

export interface BudgetPace {
    /** How much of the window has gone, 0-1. */
    elapsed: number;
    /** Day number within the window, 1-based, and how many days it holds. */
    dayOf: number;
    totalDays: number;
    /** What an even spend would have reached by now. */
    expected: number;
    /** What this rate lands on by the end of the window. */
    projected: number;
    /** spent - expected. Positive means spending faster than the limit allows. */
    ahead: number;
    /** True once the window has closed - nothing left to project. */
    finished: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `asOf` is clamped into the window: a custom period that has already closed reads as
 * complete rather than as wildly ahead of pace, and one that hasn't opened yet reads as
 * day 1 rather than dividing by a negative elapsed fraction.
 */
export function budgetPace(
    periodFrom: string, periodTo: string, asOf: string, spent: number, amount: number,
): BudgetPace {
    const from = new Date(periodFrom).getTime();
    const to = new Date(periodTo).getTime();
    const now = Math.min(Math.max(new Date(asOf).getTime(), from), to);

    const totalMs = to - from;
    // A zero-length window (a same-instant custom range) is over by definition; treating
    // it as complete keeps every ratio below finite.
    const elapsed = totalMs > 0 ? (now - from) / totalMs : 1;

    const totalDays = Math.max(1, Math.round(totalMs / DAY_MS));
    const dayOf = Math.min(totalDays, Math.floor((now - from) / DAY_MS) + 1);

    const expected = amount * elapsed;
    // Before any time has passed there is no rate to extrapolate, so the projection is
    // whatever has already been spent rather than an infinity.
    const projected = elapsed > 0 ? spent / elapsed : spent;

    return {
        elapsed,
        dayOf,
        totalDays,
        expected,
        projected,
        ahead: spent - expected,
        finished: elapsed >= 1,
    };
}
