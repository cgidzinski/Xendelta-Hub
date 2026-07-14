const ScheduledTask = require("../models/scheduledTask");
import { computeDueDates, applyAdvance } from "../utils/scheduleUtils";

export interface TaskRunResult {
  /** Due dates fully handled — the task's counter advances by this many. */
  processed: number;
  /** Permanently disable the task (a normal outcome, e.g. its target no longer exists). */
  disable?: boolean;
}

export type TaskHandler = (task: any, dueDates: Date[]) => Promise<TaskRunResult>;

/** Short tick so the "30s" test frequency is observable; the due-task query is indexed and cheap. */
export const TICK_INTERVAL_MS = 30 * 1000;

const handlers = new Map<string, TaskHandler>();
const dispatching = new Set<string>();

export function registerTaskHandler(taskType: string, handler: TaskHandler): void {
  if (handlers.has(taskType)) throw new Error(`Task handler for "${taskType}" is already registered`);
  handlers.set(taskType, handler);
}

/**
 * Run one task now. Returns the number of due dates processed.
 * Safe to call concurrently with the tick (in-process lock) and safe across
 * crash/replay: the counter is persisted with a run_count-guarded conditional
 * update, and handlers are expected to be idempotent per due date.
 */
export async function dispatchTask(task: any): Promise<number> {
  const taskId = task._id.toString();
  if (dispatching.has(taskId)) return 0;
  dispatching.add(taskId);
  try {
    if (!task.enabled) return 0;

    const handler = handlers.get(task.task_type);
    if (!handler) {
      console.warn(`No handler registered for task type "${task.task_type}" (task ${taskId}) — skipping`);
      return 0;
    }

    const now = new Date();
    const dueDates = computeDueDates(task, now);
    const originalRunCount = task.run_count;

    let result: TaskRunResult = { processed: 0 };
    if (dueDates.length > 0) {
      const handlerInput = task.catch_up === "latest" ? [dueDates[dueDates.length - 1]] : dueDates;
      try {
        result = await handler(task, handlerInput);
      } catch (e: any) {
        console.error(`Task handler "${task.task_type}" failed for task ${taskId}:`, e);
        await ScheduledTask.updateOne({ _id: task._id }, { $set: { last_error: String(e?.message ?? e) } });
        return 0; // no advance — retried next tick
      }
    }

    // "latest" deliberately skips older due dates, so a successful run advances past all of them
    const advanceBy = task.catch_up === "latest"
      ? (result.processed > 0 ? dueDates.length : 0)
      : result.processed;

    const next = applyAdvance(task, advanceBy);
    if (result.disable) next.enabled = false;
    if (advanceBy === 0 && next.enabled === task.enabled && dueDates.length === 0) return 0; // nothing to persist

    const update = await ScheduledTask.updateOne(
      { _id: task._id, run_count: originalRunCount },
      {
        $set: {
          run_count: next.run_count,
          run_at: next.run_at,
          enabled: next.enabled,
          last_run_at: now,
          last_error: null,
          payload: task.payload, // handlers may mutate payload (e.g. clearing a pending snapshot)
        },
      }
    );
    if (update.matchedCount === 0) {
      // A concurrent writer advanced/edited the task; the next tick reconciles.
      console.warn(`Task ${taskId} changed concurrently — advance skipped, will reconcile next tick`);
    }
    return result.processed;
  } finally {
    dispatching.delete(taskId);
  }
}

/** One tick: find all due tasks and dispatch each, isolated from each other's failures. */
export async function runDueTasks(): Promise<void> {
  const due = await ScheduledTask.find({ enabled: true, run_at: { $lte: new Date() } });
  for (const task of due) {
    try {
      await dispatchTask(task);
    } catch (e) {
      console.error(`Task dispatch failed for task ${task._id}:`, e);
    }
  }
}
