const ScheduledTask = require("../models/scheduledTask");
import { XENSPLIT_RECURRING_TASK_TYPE } from "./xensplitRecurringHandler";

export function transformMembers(obj: any): any {
  return {
    ...obj,
    members: Array.isArray(obj.members)
      ? obj.members.map((m: any) =>
        m._id
          ? { user_id: m._id.toString(), username: m.username || "Unknown", avatar: m.avatar || null }
          : { user_id: m.toString(), username: "Unknown", avatar: null }
      )
      : obj.members,
  };
}

/** Maps a ScheduledTask onto the client's XenSplitRecurringSeries wire shape. */
export function taskToRecurringSeries(task: any): any {
  return {
    _id: task._id,
    // Pre-birth series omit the (pre-allocated) genesis id — it points at an
    // expense that doesn't exist yet, and the client keys off its absence.
    genesis_expense_id: task.payload?.pending_expense ? undefined : task.payload?.genesis_expense_id,
    pending_expense: task.payload?.pending_expense,
    frequency: task.frequency,
    start_date: task.anchor_date,
    end_date: task.end_date ?? undefined,
    max_occurrences: task.max_runs ?? undefined,
    active: task.enabled,
    occurrence_count: task.run_count,
    next_run_at: task.run_at,
    last_generated_at: task.last_run_at ?? undefined,
    created_by: task.created_by,
    created_at: task.created_at,
  };
}

/**
 * Group response payload: member transform + recurring series hydrated from
 * ScheduledTask (the embedded recurring_expenses array is deprecated).
 * The group must already be populate("members", "username avatar")-ed.
 */
export async function serializeXenSplitGroup(group: any): Promise<any> {
  const [obj] = await serializeXenSplitGroups([group]);
  return obj;
}

/** Batched variant for list responses: one $in query across all groups. */
export async function serializeXenSplitGroups(groups: any[]): Promise<any[]> {
  const ids = groups.map((g) => g._id.toString());
  const tasks = ids.length
    ? await ScheduledTask.find({ task_type: XENSPLIT_RECURRING_TASK_TYPE, "payload.group_id": { $in: ids } }).lean()
    : [];
  const byGroup = new Map<string, any[]>();
  for (const t of tasks) {
    const gid = t.payload?.group_id;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(taskToRecurringSeries(t));
  }
  return groups.map((g) => {
    const obj = transformMembers(g.toObject());
    obj.recurring_expenses = byGroup.get(g._id.toString()) ?? [];
    return obj;
  });
}
