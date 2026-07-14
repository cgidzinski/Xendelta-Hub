// Pure schedule date math shared by the task dispatcher and domain code.
// Must stay free of model/socket imports so infrastructure can import it without cycles.

// "30s" exists for testing the scheduler; real schedules are daily or longer
export type ScheduleFrequency = "30s" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export const SCHEDULE_FREQUENCIES: ScheduleFrequency[] = ["30s", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"];

const DAY_MS = 86_400_000;
const MONTHS_PER_PERIOD: Partial<Record<ScheduleFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Date of occurrence n (n >= 0) derived purely from the anchor, in UTC.
 * Occurrence 0 is the anchor itself. Month-based frequencies clamp the anchor's
 * day-of-month per-occurrence (never cumulatively): Jan 31 -> Feb 28 -> Mar 31.
 */
export function advanceDate(anchor: Date, frequency: ScheduleFrequency, n: number): Date {
  if (frequency === "30s") return new Date(anchor.getTime() + n * 30_000);
  if (frequency === "daily") return new Date(anchor.getTime() + n * DAY_MS);
  if (frequency === "weekly") return new Date(anchor.getTime() + n * 7 * DAY_MS);
  if (frequency === "biweekly") return new Date(anchor.getTime() + n * 14 * DAY_MS);

  const months = anchor.getUTCMonth() + n * (MONTHS_PER_PERIOD[frequency] as number);
  const targetYear = anchor.getUTCFullYear() + Math.floor(months / 12);
  const targetMonth = ((months % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInUTCMonth(targetYear, targetMonth));
  return new Date(Date.UTC(
    targetYear, targetMonth, day,
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()
  ));
}

// ---- Scheduled-task state machine (pure; persisted/dispatched by TaskDispatcher) ----

export interface TaskScheduleState {
  anchor_date: Date;
  frequency: ScheduleFrequency | null; // null => one-shot
  run_count: number;
  run_at: Date;
  end_date?: Date | null; // inclusive
  max_runs?: number | null;
  catch_up?: "all" | "latest";
}

/** Bounds one catch-up pass; leftover due dates resume on the next tick. */
export const MAX_RUNS_PER_DISPATCH = 1000;

/** All due dates for a task at `now`, oldest first, bounded by cap/end_date/max_runs. */
export function computeDueDates(task: TaskScheduleState, now: Date, cap = MAX_RUNS_PER_DISPATCH): Date[] {
  if (!task.frequency) {
    return task.run_at <= now ? [new Date(task.run_at)] : [];
  }
  const due: Date[] = [];
  for (let i = 0; due.length < cap; i++) {
    if (task.max_runs && task.run_count + i >= task.max_runs) break;
    const d = advanceDate(task.anchor_date, task.frequency, task.run_count + i);
    if (d > now) break;
    if (task.end_date && d > task.end_date) break;
    due.push(d);
  }
  return due;
}

/** Pure next-state after `processed` due dates were handled. */
export function applyAdvance(task: TaskScheduleState, processed: number): { run_count: number; run_at: Date; enabled: boolean } {
  const run_count = task.run_count + processed;
  let run_at = task.run_at;
  let enabled = true;
  if (!task.frequency) {
    if (processed > 0) enabled = false; // one-shot completed
  } else {
    run_at = advanceDate(task.anchor_date, task.frequency, run_count);
    if ((task.end_date && run_at > task.end_date) || (task.max_runs && run_count >= task.max_runs)) {
      enabled = false; // retired
    }
  }
  return { run_count, run_at, enabled };
}
