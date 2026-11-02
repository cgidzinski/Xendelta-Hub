const XenRoutine = require("../models/xenRoutine");
import { notify } from "./notificationUtils";
import { shouldNotify, recipientsFor, type RoutineLike } from "./xenRoutine";

// Hourly job: remind every non-muted member of each routine that has fallen due.
// last_notified_at is stamped even if a channel failed - notify() swallows per-channel
// errors, and re-sending every hour is worse than missing one nag (the next one follows
// after remind_again_days).
export async function runRoutineReminders(now: Date = new Date()): Promise<void> {
  const due = await XenRoutine.find({ enabled: true, due_at: { $lte: now } }).exec();

  for (const doc of due) {
    try {
      const routine = doc.toObject() as RoutineLike & { name: string };
      if (!shouldNotify(routine, now)) continue;

      const overdueDays = Math.max(0, Math.floor((now.getTime() - routine.due_at.getTime()) / 86_400_000));
      const message = overdueDays === 0
        ? `"${routine.name}" is due today.`
        : `"${routine.name}" is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue.`;

      await Promise.all(
        recipientsFor(routine).map((r) =>
          notify(r.userId, {
            title: `Due: ${routine.name}`,
            message,
            link: "/internal/xenroutine",
            icon: "event_repeat",
            channels: r.channels,
          }),
        ),
      );

      // Atomic against a concurrent complete/postpone, which resets last_notified_at.
      await XenRoutine.updateOne({ _id: doc._id, due_at: doc.due_at }, { $set: { last_notified_at: now } });
    } catch (e) {
      console.error(`XenRoutine reminder failed for ${doc._id}:`, e);
    }
  }
}
