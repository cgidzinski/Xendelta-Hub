// Where the shared window lives between visits.
//
// There used to be three keys — the item list's date filter, the Overview's period and
// the Report's period — each holding a different shape. They are one key now; this module
// owns that key and the one-time migration off the old ones.

import { startOfYear } from "date-fns";
import { defaultMonthMode, parsePeriodMode, serializePeriodMode, type PeriodMode } from "./periodMode";

const key = (bookId: string) => `xenbudget_period_${bookId}`;

// Read once on the first load after the merge, then removed. Overview comes first: it's
// the tab a book opens on, so its window is the one most likely to be the intended one.
const LEGACY_KEYS = (bookId: string) => [
    `xenbudget_period_overview_${bookId}`,
    `xenbudget_period_report_${bookId}`,
];
const LEGACY_ITEMS_KEY = (bookId: string) => `xenbudget_dateFilter_items_${bookId}`;

/** The item list's old value shape, kept only long enough to migrate off it. */
function parseLegacyDateFilter(raw: string | null): PeriodMode | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj.preset === "all") return { kind: "all" };
        if (obj.preset === "thisWeek") return { kind: "preset", preset: "thisWeek" };
        if (obj.preset === "lastWeek") return { kind: "preset", preset: "lastWeek" };
        if (obj.preset === "thisYear") return { kind: "year", anchor: startOfYear(new Date()) };
        if (obj.preset === "custom" && obj.from && obj.to) {
            const from = new Date(obj.from);
            const to = new Date(obj.to);
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
            return { kind: "custom", from, to };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * The stored window for a book, migrating off the three old keys the first time. Falls
 * back to the current month — the Items tab used to open on "all" and the Report on "this
 * year", but with one shared window there is one default, and a month is the framing a
 * budgeting app is for.
 */
export function loadPeriod(bookId: string): PeriodMode {
    try {
        const current = parsePeriodMode(localStorage.getItem(key(bookId)));
        if (current) return current;

        const migrated = LEGACY_KEYS(bookId)
            .map((k) => parsePeriodMode(localStorage.getItem(k)))
            .find((m): m is PeriodMode => m !== null)
            ?? parseLegacyDateFilter(localStorage.getItem(LEGACY_ITEMS_KEY(bookId)));

        // Clear the old keys either way, so a book with nothing worth migrating doesn't
        // keep re-reading them on every load.
        for (const k of [...LEGACY_KEYS(bookId), LEGACY_ITEMS_KEY(bookId)]) localStorage.removeItem(k);

        if (migrated) {
            savePeriod(bookId, migrated);
            return migrated;
        }
    } catch {
        // Private mode, or storage disabled — fall through to the default.
    }
    return defaultMonthMode();
}

export function savePeriod(bookId: string, mode: PeriodMode): void {
    try {
        localStorage.setItem(key(bookId), serializePeriodMode(mode));
    } catch {
        // Nothing to do if the write fails; the window still applies for this session.
    }
}
