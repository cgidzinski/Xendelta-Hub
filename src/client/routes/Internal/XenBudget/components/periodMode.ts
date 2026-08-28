// The one window every XenBudget tab is looking at.
//
// Items, Overview and Report used to each carry their own idea of "the current range" —
// two different value types under three localStorage keys — so moving between tabs
// silently changed the window under you. This is the single model all three share; the
// book route owns one value of it and hands it down (see BookDetail).

import {
    endOfDay, endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfQuarter,
    startOfWeek, startOfYear, subDays, subMonths, subWeeks,
} from "date-fns";

export type PeriodPreset = "thisWeek" | "lastWeek" | "last3" | "last6" | "thisQuarter";

export type PeriodMode =
    /** No window at all — every item in the book. */
    | { kind: "all" }
    | { kind: "month"; anchor: Date }
    | { kind: "year"; anchor: Date }
    | { kind: "preset"; preset: PeriodPreset }
    | { kind: "custom"; from: Date; to: Date };

export interface ResolvedPeriod {
    from: Date;
    to: Date;
    /**
     * False only for "all". The summary and budget-status endpoints always need a real
     * range, so "all" still resolves to one — but the item list can skip the date filter
     * entirely, which is both cheaper and what it did before the models were merged.
     */
    bounded: boolean;
    groupBy: "day" | "week" | "month";
    label: string;
    /**
     * The same window named in as few characters as possible, for the period pill on a
     * phone. "August 2026" is ~150px of button, which is most of a 360px row on its own —
     * and the item list needs Source, Filters and the pill to share that row.
     */
    shortLabel: string;
}

const PRESET_LABELS: Record<PeriodPreset, { label: string; short: string }> = {
    thisWeek: { label: "This week", short: "This wk" },
    lastWeek: { label: "Last week", short: "Last wk" },
    last3: { label: "Last 3 months", short: "Last 3m" },
    last6: { label: "Last 6 months", short: "Last 6m" },
    thisQuarter: { label: "This quarter", short: "Quarter" },
};

const PRESET_VALUES = Object.keys(PRESET_LABELS) as PeriodPreset[];

/**
 * The floor for "all". An explicit date rather than an omitted one: the server defaults a
 * missing `from` to the start of the current UTC month, so leaving it off would quietly
 * show one month under an "All time" label.
 */
const EPOCH = new Date(Date.UTC(1970, 0, 1));

/** UTC midnight of a local-midnight Date's calendar day — item dates are date-only UTC. */
function utcDay(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** The end of a calendar day in UTC, so an inclusive `$lte` still covers the whole day. */
function utcEndOfDay(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
}

export const defaultMonthMode = (): PeriodMode => ({ kind: "month", anchor: startOfMonth(new Date()) });
export const defaultYearMode = (): PeriodMode => ({ kind: "year", anchor: startOfYear(new Date()) });

/** Turns a `PeriodMode` into the from/to/groupBy a query needs, plus its label. */
export function resolvePeriod(mode: PeriodMode): ResolvedPeriod {
    const now = new Date();

    if (mode.kind === "all") {
        return {
            from: EPOCH, to: utcEndOfDay(now), bounded: false,
            groupBy: "month", label: "All time", shortLabel: "All",
        };
    }
    if (mode.kind === "month") {
        const from = startOfMonth(mode.anchor);
        return {
            from: utcDay(from), to: utcEndOfDay(endOfMonth(mode.anchor)), bounded: true,
            groupBy: "day", label: format(from, "MMMM yyyy"), shortLabel: format(from, "MMM yy"),
        };
    }
    if (mode.kind === "year") {
        const from = startOfYear(mode.anchor);
        return {
            from: utcDay(from), to: utcEndOfDay(endOfYear(mode.anchor)), bounded: true,
            groupBy: "month", label: format(from, "yyyy"), shortLabel: format(from, "yyyy"),
        };
    }
    if (mode.kind === "preset") {
        // Every windowed preset runs to the end of its period rather than to now, the same
        // way month and year do — an item dated later this week is still in this week.
        if (mode.preset === "thisWeek") {
            return {
                from: utcDay(startOfWeek(now)), to: utcEndOfDay(endOfWeek(now)), bounded: true,
                groupBy: "day",
                label: PRESET_LABELS.thisWeek.label, shortLabel: PRESET_LABELS.thisWeek.short,
            };
        }
        if (mode.preset === "lastWeek") {
            return {
                from: utcDay(startOfWeek(subWeeks(now, 1))),
                to: utcEndOfDay(subDays(startOfWeek(now), 1)),
                bounded: true, groupBy: "day",
                label: PRESET_LABELS.lastWeek.label, shortLabel: PRESET_LABELS.lastWeek.short,
            };
        }
        if (mode.preset === "last3") {
            return {
                from: utcDay(startOfMonth(subMonths(now, 2))), to: utcEndOfDay(endOfMonth(now)),
                bounded: true, groupBy: "month",
                label: PRESET_LABELS.last3.label, shortLabel: PRESET_LABELS.last3.short,
            };
        }
        if (mode.preset === "last6") {
            return {
                from: utcDay(startOfMonth(subMonths(now, 5))), to: utcEndOfDay(endOfMonth(now)),
                bounded: true, groupBy: "month",
                label: PRESET_LABELS.last6.label, shortLabel: PRESET_LABELS.last6.short,
            };
        }
        return {
            from: utcDay(startOfQuarter(now)), to: utcEndOfDay(now),
            bounded: true, groupBy: "week",
            label: PRESET_LABELS.thisQuarter.label, shortLabel: PRESET_LABELS.thisQuarter.short,
        };
    }

    const days = (mode.to.getTime() - mode.from.getTime()) / 86400000;
    const wholeMonth = isWholeMonth(mode.from, mode.to);
    return {
        from: utcDay(mode.from), to: utcEndOfDay(mode.to), bounded: true,
        groupBy: days > 180 ? "month" : days > 45 ? "week" : "day",
        // A range that is exactly one calendar month reads better as its name than as a
        // start/end pair — which is what picking a month from the grid produces.
        label: wholeMonth
            ? format(mode.from, "MMMM yyyy")
            : `${format(mode.from, "MMM d")} – ${format(mode.to, "MMM d")}`,
        // No abbreviation of a date pair is both short enough for the pill and readable,
        // so an arbitrary range says what it is and the dialog says which one.
        shortLabel: wholeMonth ? format(mode.from, "MMM yy") : "Custom",
    };
}

function isWholeMonth(from: Date, to: Date): boolean {
    return from.getTime() === startOfMonth(from).getTime()
        && to.getTime() === endOfDay(endOfMonth(from)).getTime();
}

/** For stashing the picked period in localStorage — Dates aren't JSON-safe on their own. */
export function serializePeriodMode(mode: PeriodMode): string {
    if (mode.kind === "all") return JSON.stringify({ kind: "all" });
    if (mode.kind === "month" || mode.kind === "year") {
        return JSON.stringify({ kind: mode.kind, anchor: mode.anchor.toISOString() });
    }
    if (mode.kind === "preset") return JSON.stringify({ kind: "preset", preset: mode.preset });
    return JSON.stringify({ kind: "custom", from: mode.from.toISOString(), to: mode.to.toISOString() });
}

/** The other half of `serializePeriodMode`. Returns null for anything missing or malformed. */
export function parsePeriodMode(raw: string | null): PeriodMode | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj.kind === "all") return { kind: "all" };
        if (obj.kind === "month" || obj.kind === "year") {
            const anchor = new Date(obj.anchor);
            if (Number.isNaN(anchor.getTime())) return null;
            return { kind: obj.kind, anchor };
        }
        if (obj.kind === "preset" && PRESET_VALUES.includes(obj.preset)) {
            return { kind: "preset", preset: obj.preset };
        }
        if (obj.kind === "custom") {
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
