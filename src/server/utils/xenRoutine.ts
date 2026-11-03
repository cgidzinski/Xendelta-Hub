import { addDays, addMonths, addWeeks, addYears } from "date-fns";

// Pure logic for XenRoutine. Kept free of Mongoose and Express so it can be unit tested;
// the route file and the reminder job are thin wrappers around these.

export type IntervalUnit = "days" | "weeks" | "months" | "years";
export interface RoutineInterval { every: number; unit: IntervalUnit }
export interface MemberChannels { inapp: boolean; push: boolean; email: boolean }
export interface RoutineMember {
  user_id: string;
  role: "owner" | "sharer";
  muted: boolean;
  lead_days?: number;
  activity?: boolean;
  last_due_notified_at?: Date | null;
  lead_notified_for?: Date | null;
}
export interface HistoryEntry {
  action: "done" | "postponed";
  at: Date;
  by_user?: string;
  note?: string;
  due_at?: Date;
  occurrence_at?: Date;
}
export interface RoutineLike {
  owner_id: string;
  interval: RoutineInterval;
  last_done_at: Date | null;
  due_at: Date;
  enabled: boolean;
  last_notified_at: Date | null;
  done_ahead: Date[];
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

/** The Nth scheduled occurrence (1 = due_at), on the grid due_at + (N-1) * interval. */
export function occurrenceDate(routine: Pick<RoutineLike, "due_at" | "interval">, n: number): Date {
  return addInterval(routine.due_at, { every: routine.interval.every * (n - 1), unit: routine.interval.unit });
}

/**
 * Which grid positions (relative to the current due_at, 1-based) were already completed
 * ahead of time. Computed server-side so the client never has to reproduce the server's
 * date arithmetic (timezones, DST) to know which projected occurrences to hide.
 */
export function doneAheadIndices(routine: Pick<RoutineLike, "due_at" | "interval" | "done_ahead">, max = 400): number[] {
  if (!routine.done_ahead || routine.done_ahead.length === 0) return [];
  const wanted = new Set(routine.done_ahead.map((d) => d.getTime()));
  const out: number[] = [];
  for (let n = 2; n <= max && out.length < wanted.size; n++) {
    if (wanted.has(occurrenceDate(routine, n).getTime())) out.push(n);
  }
  return out;
}

/**
 * Each occurrence is its own completion.
 *
 * Completing the current one (occurrence 1) moves due_at to the next occurrence. The next
 * date is one interval after whichever is later, the completion time or the old due date:
 * an overdue routine restarts from now (the clock restarts when you actually did it), an
 * early completion keeps the schedule. Any occurrences already done ahead are skipped.
 *
 * Completing a later occurrence (N > 1) only records that one: it is remembered in
 * done_ahead so the grid skips it, and due_at stays put.
 */
export function applyComplete(
  routine: RoutineLike,
  opts: { by: string; now: Date; doneAt?: Date; note?: string; occurrence?: number },
): Pick<RoutineLike, "last_done_at" | "due_at" | "last_notified_at" | "history" | "done_ahead"> {
  const n = Math.max(1, Math.floor(opts.occurrence ?? 1));
  const doneAt = opts.doneAt && opts.doneAt.getTime() <= opts.now.getTime() ? opts.doneAt : opts.now;

  if (n > 1) {
    const date = occurrenceDate(routine, n);
    const already = routine.done_ahead.some((d) => d.getTime() === date.getTime());
    return {
      last_done_at: doneAt,
      due_at: routine.due_at,
      last_notified_at: routine.last_notified_at,
      done_ahead: already ? routine.done_ahead : [...routine.done_ahead, date],
      history: pushHistory(routine.history, { action: "done", at: opts.now, by_user: opts.by, note: opts.note, occurrence_at: date }),
    };
  }

  const base = routine.due_at.getTime() > doneAt.getTime() ? routine.due_at : doneAt;
  let due = addInterval(base, routine.interval);
  const skipped = new Set(routine.done_ahead.map((d) => d.getTime()));
  while (skipped.has(due.getTime())) due = addInterval(due, routine.interval);
  return {
    last_done_at: doneAt,
    due_at: due,
    last_notified_at: null,
    // Drop entries the new due date has caught up with; they can't be shown any more.
    done_ahead: routine.done_ahead.filter((d) => d.getTime() > due.getTime()),
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

/** A person's delivery preferences, app-wide (XenRoutineSettings.channels). */
export const ALL_CHANNELS: MemberChannels = { inapp: true, push: true, email: true };

/** The notify() channels someone has switched on. */
export function channelsFor(prefs: MemberChannels = ALL_CHANNELS, opts: { email?: boolean } = {}): NotifyChannelName[] {
  const channels: NotifyChannelName[] = [];
  // The socket emit carries the persisted notification's _id, so it only makes sense
  // alongside inapp (see notificationUtils).
  if (prefs.inapp) channels.push("inapp", "socket");
  if (prefs.push) channels.push("push");
  if (prefs.email && opts.email !== false) channels.push("email");
  return channels;
}

export type ChannelPrefs = Map<string, MemberChannels>;

/** Members to remind, each with the notify() channels they have left switched on. */
export function recipientsFor(
  routine: Pick<RoutineLike, "members">, prefs: ChannelPrefs = new Map(),
): { userId: string; channels: NotifyChannelName[] }[] {
  const out: { userId: string; channels: NotifyChannelName[] }[] = [];
  for (const m of routine.members) {
    if (m.muted) continue;
    const channels = channelsFor(prefs.get(m.user_id));
    if (channels.length > 0) out.push({ userId: m.user_id, channels });
  }
  return out;
}

/** Who hears that `actorId` completed or postponed a routine: not them, not muted, not opted out; never by email. */
export function activityRecipients(
  routine: Pick<RoutineLike, "members">, actorId: string, prefs: ChannelPrefs = new Map(),
): { userId: string; channels: NotifyChannelName[] }[] {
  const out: { userId: string; channels: NotifyChannelName[] }[] = [];
  for (const m of routine.members) {
    if (m.user_id === actorId || m.muted || m.activity === false) continue;
    const channels = channelsFor(prefs.get(m.user_id), { email: false });
    if (channels.length > 0) out.push({ userId: m.user_id, channels });
  }
  return out;
}

// ---- Per-person reminder timing ------------------------------------------------------

export interface ReminderSettings { remindHour: number; timezone: string }
export type ReminderKind = "due" | "lead";

export const DEFAULT_REMIND_HOUR = 8;

/** The zone to schedule in: the Profile setting, else what the browser reported, else UTC. */
export function effectiveTimezone(profileTz?: string | null, browserTz?: string | null): string {
  return profileTz || browserTz || "UTC";
}

/** The hour (0-23) it is in `timezone` at `now`. */
export function localHour(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

// The nag interval is measured between runs that both land in the member's reminder hour,
// so the real gap is N days give or take scheduler drift and a DST hour.
const NAG_TOLERANCE_MS = 2 * 3_600_000;

/**
 * What (if anything) to send this member right now. The hourly job calls this for every
 * member, and it only says yes during the member's own reminder hour, so each person is
 * reminded at most once a day, at the time they picked.
 *
 * - "due": the routine is due or overdue and this member has not been told for this due date,
 *   or was last told at least remind_again_days ago.
 * - "lead": it falls due within the member's lead_days and they have not had a heads-up for
 *   this due date yet.
 */
export function reminderKindFor(
  routine: RoutineLike, member: RoutineMember, settings: ReminderSettings, now: Date,
): ReminderKind | null {
  if (!routine.enabled || member.muted) return null;
  if (localHour(now, settings.timezone) !== settings.remindHour) return null;

  const due = routine.due_at.getTime();
  const t = now.getTime();

  if (due <= t) {
    const last = member.last_due_notified_at?.getTime();
    if (last === undefined || last < due) return "due";
    return t - last >= routine.remind_again_days * 86_400_000 - NAG_TOLERANCE_MS ? "due" : null;
  }

  const lead = member.lead_days ?? 0;
  if (lead > 0 && due - t <= lead * 86_400_000 && member.lead_notified_for?.getTime() !== due) return "lead";
  return null;
}

export interface ReminderItem { name: string; kind: ReminderKind; dueAt: Date }

export function reminderMessage(item: ReminderItem, now: Date): { title: string; message: string } {
  if (item.kind === "lead") {
    const days = Math.max(1, Math.ceil((item.dueAt.getTime() - now.getTime()) / 86_400_000));
    return { title: `Coming up: ${item.name}`, message: `"${item.name}" is due in ${days} day${days === 1 ? "" : "s"}.` };
  }
  const overdueDays = Math.max(0, Math.floor((now.getTime() - item.dueAt.getTime()) / 86_400_000));
  return {
    title: `Due: ${item.name}`,
    message: overdueDays === 0 ? `"${item.name}" is due today.` : `"${item.name}" is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue.`,
  };
}

/** One message for everything a person is being reminded of: overdue first, then coming up. */
export function groupForDigest(items: ReminderItem[], now: Date): { title: string; message: string } {
  if (items.length === 1) return reminderMessage(items[0], now);
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const lines = sorted.map((i) => `• ${reminderMessage(i, now).message}`);
  return { title: `${items.length} routines need attention`, message: lines.join("\n") };
}

export const isMember = (routine: Pick<RoutineLike, "members">, userId: string) =>
  routine.members.some((m) => m.user_id === userId);

/** Owner-only: edit settings, change sharing, delete. */
export const canEdit = (routine: Pick<RoutineLike, "owner_id">, userId: string) => routine.owner_id === userId;

/** Owner or sharer: complete, postpone, see history. */
export const canAct = (routine: Pick<RoutineLike, "owner_id" | "members">, userId: string) =>
  canEdit(routine, userId) || isMember(routine, userId);
