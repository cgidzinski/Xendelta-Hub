import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format } from "date-fns";
import type { Routine } from "./useRoutines";

// Pure view helpers for the XenRoutine tabs. Kept apart from useRoutines.ts (which pulls in
// the API client) so they can be unit tested on their own.

const DAY = 86_400_000;
export const OVERVIEW_HORIZON_DAYS = 30;
export const DUE_SOON_DAYS = 7;
/** What Overview looks ahead by default. */
export const DEFAULT_HORIZON_DAYS = OVERVIEW_HORIZON_DAYS;

export type Bucket = "overdue" | "soon" | "month" | "later";

/** Mirrors addInterval in src/server/utils/xenRoutine.ts (date-fns clamps month ends). */
export function addInterval(from: Date, interval: Routine["interval"], times = 1): Date {
    const n = interval.every * times;
    switch (interval.unit) {
        case "days": return addDays(from, n);
        case "weeks": return addWeeks(from, n);
        case "months": return addMonths(from, n);
        case "years": return addYears(from, n);
    }
}

/** How far ahead Overview can look. */
export const HORIZON_OPTIONS = [
    { days: 7, label: "1 week" },
    { days: 30, label: "30 days" },
    { days: 90, label: "3 months" },
    { days: 180, label: "6 months" },
    { days: 365, label: "1 year" },
] as const;

export function bucketForDate(date: Date, now: Date = new Date()): Bucket {
    const ahead = date.getTime() - now.getTime();
    if (ahead <= 0) return "overdue";
    if (ahead <= DUE_SOON_DAYS * DAY) return "soon";
    if (ahead <= OVERVIEW_HORIZON_DAYS * DAY) return "month";
    return "later";
}

export function routineStatusBucket(r: Pick<Routine, "due_at">, now: Date = new Date()): Bucket {
    return bucketForDate(new Date(r.due_at), now);
}

/** One scheduled instance of a routine. index 1 is the real due_at; 2, 3, … are projected. */
export interface Occurrence {
    routine: Routine;
    index: number;
    date: Date;
}

/**
 * The routine's upcoming occurrences within the horizon: its real due date (always, even if
 * overdue) and then one per interval after it. Every date is computed from due_at rather than
 * from the previous occurrence so month-end clamping doesn't accumulate (Jan 31 -> Feb 28 -> Mar 31).
 * `cap` stops a daily routine over a long horizon from producing hundreds of cards.
 */
export function projectOccurrences(
    routine: Routine, now: Date = new Date(), horizonDays = OVERVIEW_HORIZON_DAYS,
    cap = horizonDays <= OVERVIEW_HORIZON_DAYS ? 12 : 60,
): Occurrence[] {
    const limit = now.getTime() + horizonDays * DAY;
    const first = new Date(routine.due_at);
    const out: Occurrence[] = [];
    for (let i = 0; i < cap; i++) {
        const date = i === 0 ? first : addInterval(first, routine.interval, i);
        if (date.getTime() > limit) break;
        // Occurrences already completed ahead of time are not pending any more.
        // (?? [] because a server that predates this field simply omits it)
        if ((routine.done_ahead_indices ?? []).includes(i + 1)) continue;
        out.push({ routine, index: i + 1, date });
    }
    return out;
}

/**
 * What the Overview "Pending" list shows: every occurrence of enabled routines up to the
 * horizon, soonest first. In simplified mode only each routine's current occurrence (the
 * real due date) is kept.
 */
export function pendingOccurrences(
    routines: Routine[], now: Date = new Date(), horizonDays = OVERVIEW_HORIZON_DAYS, simplified = false,
): Occurrence[] {
    return routines
        .filter((r) => r.enabled)
        .flatMap((r) => projectOccurrences(r, now, horizonDays))
        .filter((o) => !simplified || o.index === 1)
        .sort((a, b) => a.date.getTime() - b.date.getTime() || a.index - b.index);
}

export interface Completion {
    routineId: string;
    routineName: string;
    at: string;
    by_username: string | null;
    note?: string;
    /** When the completion was for a later occurrence done ahead of time. */
    occurrenceAt?: string;
}

/** "done" history entries from the last `days` days across all routines, newest first. */
export function recentCompletions(routines: Routine[], days = OVERVIEW_HORIZON_DAYS, now: Date = new Date()): Completion[] {
    const cutoff = now.getTime() - days * DAY;
    const out: Completion[] = [];
    for (const r of routines) {
        for (const h of r.history) {
            if (h.action !== "done") continue;
            if (new Date(h.at).getTime() < cutoff) continue;
            out.push({ routineId: r._id, routineName: r.name, at: h.at, by_username: h.by_username ?? null, note: h.note, occurrenceAt: h.occurrence_at });
        }
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function dueText(r: Pick<Routine, "due_at"> | Date, now: Date = new Date()): string {
    const due = r instanceof Date ? r : new Date(r.due_at);
    const days = differenceInCalendarDays(due, now);
    if (days === 0) return "Due today";
    if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
    return `Due in ${days} day${days === 1 ? "" : "s"} (${format(due, "PP")})`;
}
