import {
    addDays, addMonths, addWeeks, setISOWeek, startOfISOWeek, startOfMonth,
} from "date-fns";

/**
 * Column headings for the report grid.
 *
 * The summary's period keys are machine-shaped - "2026-08", "2026-W34", "2026-08-21" -
 * and their format already says which bucket they are, so the shape is read back off the
 * key rather than threading `group_by` down beside it.
 */

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Past this many buckets a grid stops being readable and starts being a spreadsheet you
 * have to scroll sideways to make sense of. A year of months (12) and a quarter of weeks
 * (13) fit; a month of days (28-31) does not, and keeps the plain layout instead.
 */
export const MAX_PERIOD_COLUMNS = 13;

/** Whether a range's buckets are worth pivoting into columns at all. */
export function shouldPivot(periodKeys: string[]): boolean {
    return periodKeys.length > 1 && periodKeys.length <= MAX_PERIOD_COLUMNS;
}

function yearOf(key: string): string {
    return key.slice(0, 4);
}

/**
 * `multiYear` is passed in rather than worked out per key: a column reading "Jan" next to
 * one reading "Dec" is ambiguous only when the range crosses a year end, and in that case
 * every column needs the year, not just January's.
 */
function label(key: string, multiYear: boolean): string {
    const year = yearOf(key);
    const short = `'${year.slice(2)}`;

    // "2026-W34"
    const week = /^\d{4}-W(\d{2})$/.exec(key);
    if (week) return multiYear ? `W${Number(week[1])} ${short}` : `W${Number(week[1])}`;

    // "2026-08-21"
    const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(key);
    if (day) return `${MONTHS[Number(day[1]) - 1] ?? day[1]} ${Number(day[2])}`;

    // "2026-08"
    const month = /^\d{4}-(\d{2})$/.exec(key);
    if (month) {
        const name = MONTHS[Number(month[1]) - 1] ?? month[1];
        return multiYear ? `${name} ${short}` : name;
    }

    return key;
}

/** Headings for a set of period keys, in the order given. */
export function periodColumnLabels(periodKeys: string[]): string[] {
    const multiYear = new Set(periodKeys.map(yearOf)).size > 1;
    return periodKeys.map((key) => label(key, multiYear));
}


/**
 * The window a period key covers, as a half-open [from, to).
 *
 * Needed to restate a budget for one column: the budget maths works in dates, and the
 * summary hands back keys. The shape of the key says which bucket it is, the same way the
 * headings above are derived.
 */
export function periodKeyRange(key: string): { from: Date; to: Date } | null {
    const week = /^(\d{4})-W(\d{2})$/.exec(key);
    if (week) {
        // January 4th is always in ISO week 1, so it is a safe anchor to count from.
        const anchor = new Date(Number(week[1]), 0, 4);
        const from = startOfISOWeek(setISOWeek(anchor, Number(week[2])));
        return { from, to: addWeeks(from, 1) };
    }

    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (day) {
        const from = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
        return { from, to: addDays(from, 1) };
    }

    const month = /^(\d{4})-(\d{2})$/.exec(key);
    if (month) {
        const from = startOfMonth(new Date(Number(month[1]), Number(month[2]) - 1, 1));
        return { from, to: addMonths(from, 1) };
    }

    return null;
}

/** Whether a period key's window contains today — the column a report grid highlights as "now". */
export function isCurrentPeriod(key: string): boolean {
    const range = periodKeyRange(key);
    if (!range) return false;
    const now = new Date();
    return now >= range.from && now < range.to;
}
