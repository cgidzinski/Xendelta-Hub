const XenRoutine = require("../models/xenRoutine");
const XenRoutineSettings = require("../models/xenRoutineSettings");
const { User } = require("../models/user");
import { notify } from "./notificationUtils";
import {
  activityRecipients, ALL_CHANNELS, channelsFor, DEFAULT_REMIND_HOUR, effectiveTimezone, groupForDigest, reminderKindFor,
  type ChannelPrefs, type ReminderItem, type ReminderKind, type RoutineLike, type RoutineMember,
} from "./xenRoutine";

const DAY = 86_400_000;
// Longest heads-up a member can ask for; routines further out than this can't produce a reminder yet.
const MAX_LEAD_DAYS = 30;

interface Pending {
  routineId: any;
  dueAt: Date;
  kind: ReminderKind;
  prev: Date | null;
  item: ReminderItem;
}

/**
 * Hourly job. Each member is reminded at most once a day, in their own reminder hour and
 * timezone (Profile timezone, else the one their browser reported). Everything due for a
 * person at that hour goes out as a single message, over the channels they chose in their
 * reminder settings.
 *
 * Per-member timestamps are stamped even if a channel failed: notify() swallows per-channel
 * errors, and re-sending every hour is worse than missing one nag.
 */
export async function runRoutineReminders(now: Date = new Date()): Promise<void> {
  const routines = await XenRoutine.find({
    enabled: true,
    due_at: { $lte: new Date(now.getTime() + MAX_LEAD_DAYS * DAY) },
  }).exec();
  if (routines.length === 0) return;

  const userIds = [...new Set<string>(routines.flatMap((r: any) => r.members.map((m: any) => m.user_id)))];
  const [users, settingsDocs] = await Promise.all([
    User.find({ _id: { $in: userIds } }, "timezone").lean().exec(),
    XenRoutineSettings.find({ user_id: { $in: userIds } }).lean().exec(),
  ]);
  const tzByUser = new Map<string, string | undefined>(users.map((u: any) => [u._id.toString(), u.timezone]));
  const settingsByUser = new Map<string, any>(settingsDocs.map((s: any) => [s.user_id, s]));

  const pendingByUser = new Map<string, Pending[]>();

  for (const doc of routines) {
    const routine = doc.toObject() as RoutineLike & { name: string };
    for (const member of routine.members as RoutineMember[]) {
      const s = settingsByUser.get(member.user_id);
      const settings = {
        remindHour: s?.remind_hour ?? DEFAULT_REMIND_HOUR,
        timezone: effectiveTimezone(tzByUser.get(member.user_id), s?.browser_timezone),
      };
      const kind = reminderKindFor(routine, member, settings, now);
      if (!kind) continue;
      const list = pendingByUser.get(member.user_id) ?? [];
      list.push({
        routineId: doc._id, dueAt: routine.due_at, kind,
        // What the stamp held when we read it: the claim below only succeeds if it still does.
        prev: (kind === "due" ? member.last_due_notified_at : member.lead_notified_for) ?? null,
        item: { name: routine.name, kind, dueAt: routine.due_at },
      });
      pendingByUser.set(member.user_id, list);
    }
  }

  for (const [userId, pending] of pendingByUser) {
    try {
      // Someone who has switched every channel off gets nothing, and is not stamped, so
      // turning a channel back on later doesn't lose a reminder that was never delivered.
      const channels = channelsFor(settingsByUser.get(userId)?.channels ?? ALL_CHANNELS);
      if (channels.length === 0) continue;

      // Claim each reminder BEFORE sending. The stamp is set with a compare-and-set on its
      // previous value, so of two runs racing (a second instance, an overlapping tick) only
      // one wins each reminder and the other skips it. Stamping after sending left a window
      // where both sent. due_at is in the filter so a concurrent complete/postpone (which
      // moves it) isn't stamped as already notified.
      const claimed: Pending[] = [];
      for (const p of pending) {
        const field = p.kind === "due" ? "last_due_notified_at" : "lead_notified_for";
        const res = await XenRoutine.updateOne(
          { _id: p.routineId, due_at: p.dueAt, members: { $elemMatch: { user_id: userId, [field]: p.prev } } },
          { $set: { [`members.$.${field}`]: stampValue(p, now) } },
        );
        if (res.modifiedCount === 1) claimed.push(p);
      }
      if (claimed.length === 0) continue;

      try {
        const { title, message } = groupForDigest(claimed.map((p) => p.item), now);
        await notify(userId, { title, message, link: "/internal/xenroutine", icon: "event_repeat", channels });
      } catch (e) {
        // Nothing was delivered: put the stamps back so the next run retries.
        await Promise.all(claimed.map((p) => {
          const field = p.kind === "due" ? "last_due_notified_at" : "lead_notified_for";
          return XenRoutine.updateOne(
            { _id: p.routineId, members: { $elemMatch: { user_id: userId, [field]: stampValue(p, now) } } },
            { $set: { [`members.$.${field}`]: p.prev } },
          );
        }));
        throw e;
      }
    } catch (e) {
      console.error(`XenRoutine reminders failed for user ${userId}:`, e);
    }
  }
}

function stampValue(p: Pending, now: Date): Date {
  return p.kind === "due" ? now : p.dueAt;
}

/** Tell the other members that someone completed or postponed a routine. Never throws. */
export async function sendActivityNotices(
  routine: { members: RoutineMember[] },
  actorId: string,
  actorName: string,
  text: string,
): Promise<void> {
  try {
    const ids = routine.members.map((m) => m.user_id);
    const docs = await XenRoutineSettings.find({ user_id: { $in: ids } }).lean().exec();
    const prefs: ChannelPrefs = new Map(docs.filter((d: any) => d.channels).map((d: any) => [d.user_id, d.channels]));
    await Promise.all(activityRecipients(routine, actorId, prefs).map((r) =>
      notify(r.userId, {
        title: "XenRoutine",
        message: `${actorName} ${text}`,
        link: "/internal/xenroutine",
        icon: "event_repeat",
        channels: r.channels,
      }),
    ));
  } catch (e) {
    console.error("XenRoutine activity notice failed:", e);
  }
}
