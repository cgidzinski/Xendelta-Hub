// The one window every XenBudget tab is looking at.
//
// Items, Overview and Report used to each carry their own idea of "the current range" —
// two different value types under three localStorage keys — so moving between tabs
// silently changed the window under you. This is the single model all three share; the
// book route owns one value of it and hands it down (see BookDetail).

import {
    addDays, addMonths, addQuarters, addWeeks, addYears, endOfDay, endOfMonth, endOfQuarter,
    endOfWeek, endOfYear, format, getQuarter, startOfDay, startOfMonth, startOfQuarter,
    startOfWeek, startOfYear, subMonths, subWeeks,
} from "date-fns";

/**
 * The display ladder: one calendar unit, from a single day up to a whole year.
 *
 * Picking one restates every budget into it (see periodDisplay's `amountForUnit`), so this
 * is purely a viewing choice — it has nothing to do with the period a budget is stored
 * against, and no budget is ever shown in its own period instead.
 */
export type PeriodUnit = "day" | "week" | "month" | "quarter" | "year";

/** Multi-unit spans. No single anchor, so unlike a unit they can't be stepped through. */
export type PeriodPreset = "last3" | "last6";

export type PeriodMode =
    /** No window at all — every item in the book. */
    | { kind: "all" }
    | { kind: PeriodUnit; anchor: Date }
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

// Weeks run Monday to Sunday, matching every other week in the codebase: the server's
// budgetPeriodRange and isoWeekKey (what Mongo's %G-W%V buckets key on), and the client's
// utcStartOfWeek in budgetForRange. date-fns defaults to SUNDAY, so leaving this off puts
// the picker a day out of step with every weekly budget window it is measured against.
const MONDAY = { weekStartsOn: 1 } as const;

interface UnitSpec {
    start: (d: Date) => Date;
    end: (d: Date) => Date;
    /** Steps the anchor by whole units, for the picker's prev/next. */
    add: (d: Date, n: number) => Date;
    groupBy: "day" | "week" | "month";
    /** Both labels are handed the START of the resolved window, never the raw anchor. */
    label: (from: Date) => string;
    shortLabel: (from: Date) => string;
}

const UNITS: Record<PeriodUnit, UnitSpec> = {
    day: {
        start: startOfDay, end: endOfDay, add: addDays, groupBy: "day",
        label: (d) => format(d, "EEE, MMM d yyyy"),
        shortLabel: (d) => format(d, "MMM d"),
    },
    week: {
        start: (d) => startOfWeek(d, MONDAY),
        end: (d) => endOfWeek(d, MONDAY),
        add: addWeeks, groupBy: "day",
        label: (d) => `Week of ${format(d, "MMM d")}`,
        shortLabel: (d) => format(d, "MMM d"),
    },
    month: {
        start: startOfMonth, end: endOfMonth, add: addMonths, groupBy: "day",
        label: (d) => format(d, "MMMM yyyy"),
        shortLabel: (d) => format(d, "MMM yy"),
    },
    quarter: {
        start: startOfQuarter, end: endOfQuarter, add: addQuarters, groupBy: "week",
        label: (d) => `Q${getQuarter(d)} ${format(d, "yyyy")}`,
        shortLabel: (d) => `Q${getQuarter(d)} ${format(d, "yy")}`,
    },
    year: {
        start: startOfYear, end: endOfYear, add: addYears, groupBy: "month",
        label: (d) => format(d, "yyyy"),
        shortLabel: (d) => format(d, "yyyy"),
    },
};

/** In ladder order — day first — which is the order the picker offers them in. */
export const PERIOD_UNITS = Object.keys(UNITS) as PeriodUnit[];

type AnchoredMode = Extract<PeriodMode, { anchor: Date }>;

function isUnit(kind: unknown): kind is PeriodUnit {
    return typeof kind === "string" && (PERIOD_UNITS as string[]).includes(kind);
}

/** Whether this window is one calendar unit, and so has a previous and a next. */
export function isAnchored(mode: PeriodMode): mode is AnchoredMode {
    return isUnit(mode.kind);
}

const PRESET_LABELS: Record<PeriodPreset, { label: string; short: string }> = {
    last3: { label: "Last 3 months", short: "Last 3m" },
    last6: { label: "Last 6 months", short: "Last 6m" },
};

const PRESET_VALUES = Object.keys(PRESET_LABELS) as PeriodPreset[];

/** How many months back each span starts, counting the current month as one of them. */
const PRESET_MONTHS: Record<PeriodPreset, number> = { last3: 2, last6: 5 };

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

/** One whole unit, anchored to the unit `anchor` falls in (today by default). */
export const unitMode = (unit: PeriodUnit, anchor: Date = new Date()): PeriodMode =>
    ({ kind: unit, anchor: UNITS[unit].start(anchor) });

export const defaultMonthMode = (): PeriodMode => unitMode("month");
export const defaultYearMode = (): PeriodMode => unitMode("year");

/**
 * The same unit, `delta` steps earlier or later.
 *
 * Anything without a single anchor — "all", a multi-month span, a hand-picked range — has
 * nothing to step, so it comes back unchanged and the caller hides the arrows rather than
 * having to know which kinds are steppable.
 */
export function stepPeriod(mode: PeriodMode, delta: number): PeriodMode {
    if (!isAnchored(mode)) return mode;
    const spec = UNITS[mode.kind];
    return { kind: mode.kind, anchor: spec.start(spec.add(mode.anchor, delta)) };
}

/** Turns a `PeriodMode` into the from/to/groupBy a query needs, plus its label. */
export function resolvePeriod(mode: PeriodMode): ResolvedPeriod {
    const now = new Date();

    if (mode.kind === "all") {
        return {
            from: EPOCH, to: utcEndOfDay(now), bounded: false,
            groupBy: "month", label: "All time", shortLabel: "All",
        };
    }

    if (mode.kind === "preset") {
        // Both surviving spans are whole months ending with the current one. They run to the
        // end of this month rather than to now, the same way a unit does — an item dated
        // later this month is still in it.
        return {
            from: utcDay(startOfMonth(subMonths(now, PRESET_MONTHS[mode.preset]))),
            to: utcEndOfDay(endOfMonth(now)),
            bounded: true, groupBy: "month",
            label: PRESET_LABELS[mode.preset].label,
            shortLabel: PRESET_LABELS[mode.preset].short,
        };
    }

    if (mode.kind === "custom") {
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

    const spec = UNITS[mode.kind];
    const from = spec.start(mode.anchor);
    return {
        from: utcDay(from), to: utcEndOfDay(spec.end(mode.anchor)), bounded: true,
        groupBy: spec.groupBy, label: spec.label(from), shortLabel: spec.shortLabel(from),
    };
}

function isWholeMonth(from: Date, to: Date): boolean {
    return from.getTime() === startOfMonth(from).getTime()
        && to.getTime() === endOfDay(endOfMonth(from)).getTime();
}

/** For stashing the picked period in localStorage — Dates aren't JSON-safe on their own. */
export function serializePeriodMode(mode: PeriodMode): string {
    if (mode.kind === "all") return JSON.stringify({ kind: "all" });
    if (mode.kind === "preset") return JSON.stringify({ kind: "preset", preset: mode.preset });
    if (mode.kind === "custom") {
        return JSON.stringify({ kind: "custom", from: mode.from.toISOString(), to: mode.to.toISOString() });
    }
    return JSON.stringify({ kind: mode.kind, anchor: mode.anchor.toISOString() });
}

// Windows stored before the ladder existed. Week and quarter were fixed presets carrying no
// anchor, so they are read back as the anchored unit they always described. Without this an
// upgrade would fail to parse them and quietly drop everyone back to the default month.
const RETIRED_PRESETS: Record<string, () => PeriodMode> = {
    thisWeek: () => unitMode("week"),
    lastWeek: () => unitMode("week", subWeeks(new Date(), 1)),
    thisQuarter: () => unitMode("quarter"),
};

/** The other half of `serializePeriodMode`. Returns null for anything missing or malformed. */
export function parsePeriodMode(raw: string | null): PeriodMode | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj.kind === "all") return { kind: "all" };
        if (isUnit(obj.kind)) {
            const anchor = new Date(obj.anchor);
            if (Number.isNaN(anchor.getTime())) return null;
            return { kind: obj.kind, anchor };
        }
        if (obj.kind === "preset") {
            if (PRESET_VALUES.includes(obj.preset)) return { kind: "preset", preset: obj.preset };
            const retired = RETIRED_PRESETS[obj.preset];
            return retired ? retired() : null;
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
