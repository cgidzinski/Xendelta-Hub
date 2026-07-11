const XenSplit = require("../models/xenSplit");
import { SocketManager } from "../infrastructure/SocketManager";
import { notify } from "./notificationUtils";

// "30s" exists for testing the scheduler; real schedules are daily or longer
export type RecurringFrequency = "30s" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export const RECURRING_FREQUENCIES: RecurringFrequency[] = ["30s", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"];

const DAY_MS = 86_400_000;
const MONTHS_PER_PERIOD: Partial<Record<RecurringFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

// Bounds a single catch-up save; leftover backfill continues on the next tick
const MAX_OCCURRENCES_PER_RUN = 1000;
// Short tick so the "30s" test frequency is observable; the due-series query is indexed and cheap
const TICK_INTERVAL_MS = 30 * 1000;

function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Date of occurrence n (n >= 0) derived purely from the anchor, in UTC.
 * Occurrence 0 is the anchor itself. Month-based frequencies clamp the anchor's
 * day-of-month per-occurrence (never cumulatively): Jan 31 -> Feb 28 -> Mar 31.
 */
export function advanceDate(anchor: Date, frequency: RecurringFrequency, n: number): Date {
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

const processingGroups = new Set<string>();

function buildOccurrence(source: any, dueDate: Date, genesisId: any) {
  return {
    paid_by: source.paid_by,
    created_by: source.created_by,
    amount: source.amount,
    currency: source.currency,
    title: source.title,
    notes: source.notes,
    category: source.category || undefined,
    date: dueDate,
    split_type: source.split_type,
    splits: (source.splits || []).map((s: any) => ({
      user_id: s.user_id,
      amount_owed: s.amount_owed,
      percentage: s.percentage,
    })),
    on_hold: false,
    do_not_simplify: source.do_not_simplify === true,
    recurring_id: genesisId,
    created_at: new Date(),
  };
}

/**
 * Generate all due occurrences for one group's recurring series.
 * Safe to call concurrently (self-deduped) and idempotent across restarts:
 * counters advance in the same document save that appends the expenses.
 * Returns the number of expenses created.
 */
export async function processGroupRecurringExpenses(groupId: string): Promise<number> {
  if (processingGroups.has(groupId)) return 0;
  processingGroups.add(groupId);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generateForGroup(groupId);
      } catch (e: any) {
        // A user write raced our save; refetch and regenerate once
        if (e?.name === "VersionError" && attempt === 0) continue;
        throw e;
      }
    }
    return 0;
  } finally {
    processingGroups.delete(groupId);
  }
}

async function generateForGroup(groupId: string): Promise<number> {
  const group = await XenSplit.findById(groupId);
  if (!group || !group.recurring_expenses?.length) return 0;

  const now = new Date();
  let totalGenerated = 0;
  const seriesRuns: { title: string; amount: number; currency: string; count: number; involved: Set<string>; createdBy?: string }[] = [];

  for (const series of group.recurring_expenses) {
    if (!series.active) continue;
    let count = 0;
    let source = series.genesis_expense_id ? group.expenses.id(series.genesis_expense_id) : null;

    while (series.next_run_at <= now && totalGenerated < MAX_OCCURRENCES_PER_RUN) {
      if (series.end_date && series.next_run_at > series.end_date) break;
      if (series.max_occurrences && series.occurrence_count >= series.max_occurrences) break;

      const dueDate = new Date(series.next_run_at);
      if (series.occurrence_count === 0) {
        // Birth the genesis from the snapshot taken at creation time
        if (!series.pending_expense) { series.active = false; break; }
        group.expenses.push({ ...buildOccurrence(series.pending_expense, dueDate, undefined), recurring_id: undefined });
        source = group.expenses[group.expenses.length - 1];
        series.genesis_expense_id = source._id;
        series.pending_expense = undefined;
      } else {
        if (!source) { series.active = false; break; } // genesis vanished outside the cancel path
        group.expenses.push(buildOccurrence(source, dueDate, source._id));
      }

      series.occurrence_count += 1;
      series.last_generated_at = new Date();
      series.next_run_at = advanceDate(series.start_date, series.frequency, series.occurrence_count);
      totalGenerated++;
      count++;
    }

    // Retire series whose next due date can never fire
    if ((series.end_date && series.next_run_at > series.end_date) ||
        (series.max_occurrences && series.occurrence_count >= series.max_occurrences)) {
      series.active = false;
    }

    if (count > 0 && source) {
      seriesRuns.push({
        title: source.title,
        amount: source.amount,
        currency: source.currency,
        count,
        involved: new Set<string>([source.paid_by?.toString(), ...(source.splits || []).map((s: any) => s.user_id?.toString())].filter(Boolean)),
        createdBy: source.created_by,
      });
    }
  }

  if (totalGenerated === 0) return 0;

  await group.save();

  const memberIds = (group.members as any[]).map((m: any) => m.toString());
  for (const run of seriesRuns) {
    const message = run.count === 1
      ? `Recurring: ${run.title} (${run.amount} ${run.currency})`
      : `Recurring: ${run.title} — ${run.count} occurrences added`;
    for (const mid of memberIds) {
      if (mid !== run.createdBy && run.involved.has(mid)) {
        await notify(mid, "Recurring Expense", message, `/internal/xensplit/groups/${groupId}/expenses`);
      }
    }
  }
  SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, memberIds);

  return totalGenerated;
}

/** One scheduler tick: find all groups with due active series and process each. */
export async function runRecurringExpenseTick(): Promise<void> {
  const due = await XenSplit.find(
    { recurring_expenses: { $elemMatch: { active: true, next_run_at: { $lte: new Date() } } } },
    { _id: 1 }
  ).lean();
  for (const g of due) {
    try {
      await processGroupRecurringExpenses(g._id.toString());
    } catch (e) {
      console.error(`Recurring expense generation failed for group ${g._id}:`, e);
    }
  }
}

let started = false;

/** Immediate catch-up tick (covers server downtime) plus a recurring interval. */
export function startRecurringExpenseScheduler(): void {
  if (started) return;
  started = true;
  runRecurringExpenseTick().catch((e) => console.error("Recurring expense startup tick failed:", e));
  setInterval(() => {
    runRecurringExpenseTick().catch((e) => console.error("Recurring expense tick failed:", e));
  }, TICK_INTERVAL_MS);
}
