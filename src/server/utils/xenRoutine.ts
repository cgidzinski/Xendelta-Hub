import { addDays, addMonths, addWeeks, addYears } from "date-fns";

// Pure logic for XenRoutine. Kept free of Mongoose and Express so it can be unit tested;
// the route file and the reminder job are thin wrappers around these.

export type IntervalUnit = "days" | "weeks" | "months" | "years";
export interface RoutineInterval { every: number; unit: IntervalUnit }
export interface MemberChannels { inapp: boolean; push: boolean; email: boolean }
export interface RoutineMember {
  user_id: string;
  role: "owner" | "sharer";
  channels: MemberChannels;
  muted: boolean;
}
export interface HistoryEntry {
  action: "done" | "postponed";
  at: Date;
  by_user?: string;
  note?: string;
  due_at?: Date;
}
export interface RoutineLike {
  owner_id: string;
  interval: RoutineInterval;
  last_done_at: Date | null;
  due_at: Date;
  enabled: boolean;
  last_notified_at: Date | null;
  remind_again_days: number;
  members: RoutineMember[];
  history: HistoryEntry[];
}

export const MAX_HISTORY = 50;
/** A routine counts as "due soon" this many days before it falls due. */
export const DUE_SOON_DAYS = 7;

export type DueStatus = "ok" | "due_soon" | "overdue";

export function addInterval(from: Date, interval: RoutineInterval): Date {
  // date-fns clamps month-ends (Jan 31 + 1 month = Feb 28/29).
  switch (interval.unit) {
    case "days": return addDays(from, interval.every);
    case "weeks": return addWeeks(from, interval.every);
    case "months": return addMonths(from, interval.every);
    case "years": return addYears(from, interval.every);
  }
}

export function computeDueStatus(routine: Pick<RoutineLike, "due_at">, now: Date): DueStatus {
  const due = routine.due_at.getTime();
  if (due <= now.getTime()) return "overdue";
  if (due - now.getTime() <= DUE_SOON_DAYS * 86_400_000) return "due_soon";
  return "ok";
}

/** Whether the hourly job should send reminders for this routine right now. */
export function shouldNotify(routine: RoutineLike, now: Date): boolean {
  if (!routine.enabled) return false;
  if (routine.due_at.getTime() > now.getTime()) return false;
  if (!routine.last_notified_at) return true;
  // A completion/postpone moves due_at forward, so last_notified_at older than due_at
  // means this is the first reminder for the current due date.
  if (routine.last_notified_at.getTime() < routine.due_at.getTime()) return true;
  const gap = routine.remind_again_days * 86_400_000;
  return now.getTime() - routine.last_notified_at.getTime() >= gap;
}

export function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...history, entry].slice(-MAX_HISTORY);
}

export function applyComplete(
  routine: RoutineLike,
  opts: { by: string; now: Date; doneAt?: Date; note?: string },
): Pick<RoutineLike, "last_done_at" | "due_at" | "last_notified_at" | "history"> {
  const doneAt = opts.doneAt && opts.doneAt.getTime() <= opts.now.getTime() ? opts.doneAt : opts.now;
  return {
    last_done_at: doneAt,
    due_at: addInterval(doneAt, routine.interval),
    last_notified_at: null,
    history: pushHistory(routine.history, { action: "done", at: opts.now, by_user: opts.by, note: opts.note }),
  };
}

export function applyPostpone(
  routine: RoutineLike,
  opts: { by: string; now: Date; days?: number; until?: Date; note?: string },
): Pick<RoutineLike, "due_at" | "last_notified_at" | "history"> {
  const dueAt = opts.until ?? addDays(opts.now, opts.days ?? 1);
  return {
    due_at: dueAt,
    last_notified_at: null,
    history: pushHistory(routine.history, {
      action: "postponed", at: opts.now, by_user: opts.by, note: opts.note, due_at: dueAt,
    }),
  };
}

export type NotifyChannelName = "inapp" | "socket" | "push" | "email";

/** Members to remind, each with the notify() channels they have left switched on. */
export function recipientsFor(routine: Pick<RoutineLike, "members">): { userId: string; channels: NotifyChannelName[] }[] {
  const out: { userId: string; channels: NotifyChannelName[] }[] = [];
  for (const m of routine.members) {
    if (m.muted) continue;
    const channels: NotifyChannelName[] = [];
    // The socket emit carries the persisted notification's _id, so it only makes sense
    // alongside inapp (see notificationUtils).
    if (m.channels.inapp) channels.push("inapp", "socket");
    if (m.channels.push) channels.push("push");
    if (m.channels.email) channels.push("email");
    if (channels.length > 0) out.push({ userId: m.user_id, channels });
  }
  return out;
}

export const isMember = (routine: Pick<RoutineLike, "members">, userId: string) =>
  routine.members.some((m) => m.user_id === userId);

/** Owner-only: edit settings, change sharing, delete. */
export const canEdit = (routine: Pick<RoutineLike, "owner_id">, userId: string) => routine.owner_id === userId;

/** Owner or sharer: complete, postpone, see history. */
export const canAct = (routine: Pick<RoutineLike, "owner_id" | "members">, userId: string) =>
  canEdit(routine, userId) || isMember(routine, userId);
