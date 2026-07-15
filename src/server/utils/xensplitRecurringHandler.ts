const mongoose = require("mongoose");
const XenSplit = require("../models/xenSplit");
const ScheduledTask = require("../models/scheduledTask");
import { SocketManager } from "../infrastructure/SocketManager";
import { notify } from "./notificationUtils";
import { registerTaskHandler, TaskRunResult } from "../infrastructure/TaskDispatcher";

export const XENSPLIT_RECURRING_TASK_TYPE = "xensplit:recurring-expense";

// Task payload contract: { group_id, genesis_expense_id (always set — pre-allocated
// for future-start series), pending_expense? (present until the genesis is born) }

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

export async function handleRecurringExpenseTask(task: any, dueDates: Date[]): Promise<TaskRunResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await generate(task, dueDates);
    } catch (e: any) {
      // A user write raced our group save; refetch and regenerate once
      if (e?.name === "VersionError" && attempt === 0) continue;
      throw e;
    }
  }
  return { processed: 0 };
}

async function generate(task: any, dueDates: Date[]): Promise<TaskRunResult> {
  const group = await XenSplit.findById(task.payload.group_id);
  if (!group) return { processed: 0, disable: true }; // group deleted — orphaned task self-heals

  const genesisId = task.payload.genesis_expense_id;
  let source = group.expenses.id(genesisId);
  let processed = 0;
  let pushedCount = 0;
  let remaining = dueDates;

  if (!source && task.payload.pending_expense) {
    // Birth the genesis from the creation-time snapshot, reusing the pre-allocated id.
    // The snapshot is cleared only AFTER the group save succeeds — a VersionError
    // retry re-enters generate() and still needs it to birth the genesis.
    group.expenses.push({
      ...buildOccurrence(task.payload.pending_expense, dueDates[0], undefined),
      _id: genesisId,
      recurring_id: undefined,
    });
    source = group.expenses.id(genesisId);
    processed++;
    pushedCount++;
    remaining = dueDates.slice(1);
  } else if (!source) {
    return { processed: 0, disable: true }; // genesis vanished outside the cancel path
  } else if (task.payload.pending_expense) {
    // Birth already happened but a crash prevented the task advance — clean up the snapshot
    task.payload = { ...task.payload, pending_expense: undefined };
  }

  // Dedup on (recurring_id, date): due dates are deterministic, so replaying any
  // prefix after a crash between the group save and the task advance is a no-op.
  // The genesis's own date is included so a replayed birth date isn't re-pushed
  // as an occurrence.
  const existing = new Set<number>(
    group.expenses
      .filter((e: any) => e.recurring_id?.toString() === genesisId.toString())
      .map((e: any) => new Date(e.date).getTime())
  );
  existing.add(new Date(source.date).getTime());

  for (const dueDate of remaining) {
    processed++;
    if (existing.has(dueDate.getTime())) continue;
    group.expenses.push(buildOccurrence(source, dueDate, source._id));
    pushedCount++;
  }

  if (pushedCount > 0) {
    await group.save();

    if (task.payload.pending_expense) {
      // The genesis is persisted — safe to drop the snapshot (dispatcher persists payload)
      task.payload = { ...task.payload, pending_expense: undefined };
    }

    const groupId = group._id.toString();
    const memberIds = (group.members as any[]).map((m: any) => m.toString());
    const message = pushedCount === 1
      ? `Recurring: ${source.title} (${source.amount} ${source.currency})`
      : `Recurring: ${source.title} — ${pushedCount} occurrences added`;
    const involved = new Set<string>(
      [source.paid_by?.toString(), ...(source.splits || []).map((s: any) => s.user_id?.toString())].filter(Boolean)
    );
    for (const mid of memberIds) {
      if (mid !== source.created_by && involved.has(mid)) {
        await notify(mid, "Recurring Expense", message, `/internal/xensplit/groups/${groupId}/expenses`);
      }
    }
    SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, memberIds);
  }

  return { processed };
}

export function registerXenSplitRecurringHandler(): void {
  registerTaskHandler(XENSPLIT_RECURRING_TASK_TYPE, handleRecurringExpenseTask);
}

/**
 * One-time idempotent migration: embedded group.recurring_expenses -> ScheduledTask.
 * Reuses each subdoc _id as the task _id, so a duplicate key means "already
 * migrated" and client-held series ids keep resolving across the deploy.
 */
export async function migrateEmbeddedRecurringSeries(): Promise<void> {
  const groups = await XenSplit.find({ "recurring_expenses.0": { $exists: true } });
  let migrated = 0;
  let skipped = 0;
  for (const group of groups) {
    let groupFullyMigrated = true;
    for (const series of group.recurring_expenses) {
      try {
        await ScheduledTask.create({
          _id: series._id,
          task_type: XENSPLIT_RECURRING_TASK_TYPE,
          enabled: series.active,
          run_at: series.next_run_at,
          anchor_date: series.start_date,
          frequency: series.frequency,
          end_date: series.end_date,
          max_runs: series.max_occurrences,
          run_count: series.occurrence_count,
          catch_up: "all",
          last_run_at: series.last_generated_at,
          created_by: series.created_by,
          created_at: series.created_at,
          payload: {
            group_id: group._id.toString(),
            genesis_expense_id: (series.genesis_expense_id ?? new mongoose.Types.ObjectId()).toString(),
            pending_expense: series.pending_expense,
          },
        });
        migrated++;
      } catch (e: any) {
        if (e?.code === 11000) continue; // already migrated on a previous boot
        // A bad series (e.g. a frequency the new schema no longer accepts) must not
        // block the rest of the migration or the scheduler bootstrap. Its embedded
        // copy is kept for manual repair.
        skipped++;
        groupFullyMigrated = false;
        console.error(`>>> Skipped migrating recurring series ${series._id} in group ${group._id}:`, e?.message ?? e);
      }
    }
    if (groupFullyMigrated) {
      await XenSplit.updateOne({ _id: group._id }, { $set: { recurring_expenses: [] } });
    }
  }
  if (groups.length > 0) {
    console.log(`>>> Migrated ${migrated} recurring series from ${groups.length} group(s) to ScheduledTask${skipped ? ` (${skipped} skipped — see errors above)` : ""}`);
  }
}
