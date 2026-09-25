const XenSplitLog = require("../models/xenSplitLog");
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
}

export async function deleteXenSplitLogs(groupId: unknown): Promise<void> {
  await XenSplitLog.deleteMany({ group_id: String(groupId) });
}
