import { budgetPace } from "./budgetPace";

/**
 * Where the whole book lands by the end of the period.
 *
 * budgetPace answers this for one budget; this answers it for the book, which is the
 * number that says "am I okay this month" without reading eight bars.
 */

export interface BookProjection {
    /** How much of the window has gone, 0-1, and whether it has closed. */
    elapsed: number;
    finished: boolean;
    /** Spending extrapolated from the rate so far. */
    runRate: number;
    /** Recurring charges still due before the window closes. */
    committed: number;
    /** The figure actually shown. See below for why this is a max and not a sum. */
    projectedExpense: number;
    /** Income seen so far — deliberately not extrapolated. */
    income: number;
    /** income - projectedExpense. */
    projectedNet: number;
}

export interface BookProjectionInput {
    periodFrom: string;
    periodTo: string;
    asOf: string;
    /** Spent so far in the window. */
    expense: number;
    /** Received so far in the window. */
    income: number;
    /** Recurring charges due in the REMAINDER of the window — see commitmentsIn(). */
    committed: number;
}

export function projectBook({
    periodFrom, periodTo, asOf, expense, income, committed,
}: BookProjectionInput): BookProjection {
    // budgetPace carries a limit, which a book doesn't have. Only its limit-independent
    // fields are read here (elapsed, projected, finished); `expected` and `ahead` are
    // meaningless against a zero limit and are deliberately not surfaced.
    const pace = budgetPace(periodFrom, periodTo, asOf, expense, 0);

    // The MAX, not the sum, and this is the whole subtlety of the figure.
    //
    // The run rate already extrapolates every kind of spending, recurring included: if
    // Netflix charged on the 15th of a 30-day month, then on the 20th the linear
    // projection has silently scaled that charge by 1.5 as though it recurs within the
    // month. Adding committed spend on top of that would count the same subscriptions a
    // second time.
    //
    // But the run rate can also be too LOW: a month whose rent hasn't posted yet projects
    // as though it never will. So the projection is the larger of "carry on at this rate"
    // and "what's already spent, plus what is contractually still to come" — never their
    // sum. Both are honest floors; neither is added to the other.
    const projectedExpense = Math.max(pace.projected, expense + committed);

    return {
        elapsed: pace.elapsed,
        finished: pace.finished,
        runRate: pace.projected,
        committed,
        projectedExpense,
        // Income is lumpy — one or two paycheques, not a smooth rate — so extrapolating it
        // invents money that may never arrive. Being conservative on what comes in and
        // aggressive on what goes out is the right bias for a budget.
        income,
        projectedNet: Math.round((income - projectedExpense) * 100) / 100,
    };
}
