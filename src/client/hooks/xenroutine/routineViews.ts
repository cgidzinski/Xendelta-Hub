import { differenceInCalendarDays, format } from "date-fns";
import type { Routine } from "./useRoutines";

// Pure view helpers for the XenRoutine tabs. Kept apart from useRoutines.ts (which pulls in
// the API client) so they can be unit tested on their own.

const DAY = 86_400_000;
export const OVERVIEW_HORIZON_DAYS = 30;
export const DUE_SOON_DAYS = 7;

export type Bucket = "overdue" | "soon" | "month" | "later";

export function routineStatusBucket(r: Pick<Routine, "due_at">, now: Date = new Date()): Bucket {
    const ahead = new Date(r.due_at).getTime() - now.getTime();
    if (ahead <= 0) return "overdue";
    if (ahead <= DUE_SOON_DAYS * DAY) return "soon";
    if (ahead <= OVERVIEW_HORIZON_DAYS * DAY) return "month";
    return "later";
}

/** What the Overview "Pending" list shows: enabled routines overdue or due within the horizon, soonest first. */
export function pendingRoutines(routines: Routine[], now: Date = new Date()): Routine[] {
    return routines
        .filter((r) => r.enabled && routineStatusBucket(r, now) !== "later")
        .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
}

export interface Completion {
    routineId: string;
    routineName: string;
    at: string;
    by_username: string | null;
    note?: string;
}

/** "done" history entries from the last `days` days across all routines, newest first. */
export function recentCompletions(routines: Routine[], days = OVERVIEW_HORIZON_DAYS, now: Date = new Date()): Completion[] {
    const cutoff = now.getTime() - days * DAY;
    const out: Completion[] = [];
    for (const r of routines) {
        for (const h of r.history) {
            if (h.action !== "done") continue;
            if (new Date(h.at).getTime() < cutoff) continue;
            out.push({ routineId: r._id, routineName: r.name, at: h.at, by_username: h.by_username ?? null, note: h.note });
        }
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function dueText(r: Pick<Routine, "due_at">, now: Date = new Date()): string {
    const days = differenceInCalendarDays(new Date(r.due_at), now);
    if (days === 0) return "Due today";
    if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
    return `Due in ${days} day${days === 1 ? "" : "s"} (${format(new Date(r.due_at), "PP")})`;
}
