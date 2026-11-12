import { XenSplitLog } from "../models/xenSplitLog";
import { XenSplit } from "../models/xenSplit";
import { recordActivity } from "../activity";
import type { XenSplitLogAction, XenSplitLogChange, XenSplitLogTargetType } from "./xenSplitLogUtils";

export interface XenSplitLogEntry {
  targetType?: XenSplitLogTargetType;
  targetId?: unknown;
  summary?: string;
  meta?: Record<string, unknown>;
  changes?: XenSplitLogChange[];
}

/**
 * Appends one row to a group's activity log. Called after the mutation has been saved;
 * a logging failure is reported and swallowed so it can never fail the user's request.
 */
export async function logXenSplit(
  groupId: unknown,
  actorId: string | null,
  action: XenSplitLogAction,
  entry: XenSplitLogEntry = {},
): Promise<void> {
  try {
    await XenSplitLog.create({
      group_id: String(groupId),
      actor_id: actorId,
      action,
      target_type: entry.targetType,
      target_id: entry.targetId !== undefined && entry.targetId !== null ? String(entry.targetId) : undefined,
      summary: entry.summary,
      meta: entry.meta,
      changes: entry.changes && entry.changes.length > 0 ? entry.changes : undefined,
    });
  } catch (error) {
    console.error(`Failed to write XenSplit log (${action}):`, error);
  }
  await recordSplitActivity(groupId, actorId, action, entry);
}

/**
 * The Home feed's view of the audit log: a few of the log's actions are worth telling the rest of the group about.
 * The audit log itself stays as it is (owner-only, complete); this is the thin adapter onto the activity bus.
 */
async function recordSplitActivity(
  groupId: unknown,
  actorId: string | null,
  action: XenSplitLogAction,
  entry: XenSplitLogEntry,
): Promise<void> {
  if (!actorId) return; // system actions (generated recurring expenses) are not anyone's news
  const meta = entry.meta ?? {};
  const spaceId = String(groupId);
  const group = await XenSplit.findById(spaceId, "name")
    .lean()
    .catch(() => null);
  if (!group) return;
  const space = { app: "xensplit", id: spaceId, label: group.name };

  if (action === "expense_created" && typeof entry.targetId !== "undefined") {
    await recordActivity({
      actor: actorId,
      verb: "xensplit.expense_created",
      object: { type: "expense", id: String(entry.targetId), label: entry.summary },
      space,
      audience: "space",
      data: { amount: meta.amount, currency: meta.currency },
    });
  } else if (action === "settlement_created" && typeof entry.targetId !== "undefined") {
    await recordActivity({
      actor: actorId,
      verb: "xensplit.settlement_created",
      object: { type: "settlement", id: String(entry.targetId) },
      space,
      audience: "space",
      data: { amount: meta.amount, currency: meta.currency },
    });
  } else if (action === "member_added" && typeof meta.user_id === "string") {
    // Only the person who was added is told; the rest of the group already sees the roster change.
    await recordActivity({
      actor: actorId,
      verb: "xensplit.member_added",
      object: { type: "member", id: meta.user_id },
      space,
      audience: { users: [meta.user_id] },
    });
  }
}

export async function deleteXenSplitLogs(groupId: unknown): Promise<void> {
  await XenSplitLog.deleteMany({ group_id: String(groupId) });
}
