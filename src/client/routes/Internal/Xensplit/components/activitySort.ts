/**
 * Ordering for the XenSplit expense list and activity feed.
 *
 * Every row has two timestamps that can disagree: the transaction date the user picked
 * (`date`, backdatable from the expense form) and when the row was actually entered
 * (`added`). Sorting only by the former buries a receipt typed up today but dated last
 * month, so both views let the reader pick which timeline they are looking at.
 */

/** Which of a row's two timestamps orders the list. */
export type SortField = "date" | "added";
export type SortDir = "desc" | "asc";

export interface SortMode {
    field: SortField;
    dir: SortDir;
}

export const DEFAULT_SORT: SortMode = { field: "date", dir: "desc" };

/**
 * A feed row carrying both timestamps, so the comparator never has to know which kind of
 * item it is holding. Callers fill `added` with whatever means "entered" for their item -
 * settlements, for instance, are only ever stamped server-side, so both fields match.
 */
export interface SortableRow {
    date: string;
    added: string;
}

export function sortDateOf(row: SortableRow, field: SortField): string {
    return field === "added" ? row.added : row.date;
}

/**
 * Sorts a copy by the chosen timestamp and direction.
 *
 * Callers pair this with `groupByDay`, which only merges into its last group - so the day
 * headers are correct for either direction, but only while grouped on the same field that
 * was sorted on (see `sortDateOf`).
 */
export function sortByMode<T extends SortableRow>(rows: T[], mode: SortMode): T[] {
    const sign = mode.dir === "asc" ? 1 : -1;
    return [...rows].sort(
        (a, b) =>
            sign *
            (new Date(sortDateOf(a, mode.field)).getTime() - new Date(sortDateOf(b, mode.field)).getTime())
    );
}

/** The next mode when a toggle button is pressed: a new field restarts at newest-first,
 *  while pressing the active one (which MUI reports as `null`) reverses the order. */
export function nextSortMode(current: SortMode, pressed: SortField | null): SortMode {
    if (pressed === null) return { ...current, dir: current.dir === "desc" ? "asc" : "desc" };
    if (pressed === current.field) return current;
    return { field: pressed, dir: "desc" };
}

/** Parses a stored mode, falling back to the default for absent or malformed values.
 *  Split from `loadSortMode` so the parsing is testable without a DOM. */
export function parseSortMode(raw: string | null): SortMode {
    if (!raw) return DEFAULT_SORT;
    try {
        const parsed = JSON.parse(raw) as Partial<SortMode>;
        const field: SortField = parsed.field === "added" ? "added" : "date";
        const dir: SortDir = parsed.dir === "asc" ? "asc" : "desc";
        return { field, dir };
    } catch {
        return DEFAULT_SORT;
    }
}

/** Reads a persisted mode. A blocked or unavailable localStorage yields the default. */
export function loadSortMode(key: string): SortMode {
    try {
        return parseSortMode(localStorage.getItem(key));
    } catch {
        return DEFAULT_SORT;
    }
}

export function saveSortMode(key: string, mode: SortMode): void {
    try {
        localStorage.setItem(key, JSON.stringify(mode));
    } catch {
        // A full or unavailable localStorage shouldn't break sorting.
    }
}
