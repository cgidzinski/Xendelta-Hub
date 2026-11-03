const XenRoutine = require("../models/xenRoutine");
const XenRoutineSettings = require("../models/xenRoutineSettings");
const { User } = require("../models/user");
import { notify, type NotifyChannel } from "./notificationUtils";
import {
  activityRecipients, channelsFor, DEFAULT_REMIND_HOUR, effectiveTimezone, groupForDigest, reminderKindFor,
  reminderMessage, type ReminderItem, type ReminderKind, type RoutineLike, type RoutineMember,
} from "./xenRoutine";

const DAY = 86_400_000;
// Longest heads-up a member can ask for; routines further out than this can't produce a reminder yet.
const MAX_LEAD_DAYS = 30;

interface Pending {
  routineId: any;
  dueAt: Date;
  kind: ReminderKind;
  item: ReminderItem;
  channels: NotifyChannel[];
}

/**
 * Hourly job. Each member is reminded at most once a day, in their own reminder hour and
 * timezone (Profile timezone, else the one their browser reported), either per routine or,
 * if they chose a digest, as a single message.
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
      const channels = channelsFor(member);
      if (channels.length === 0) continue;
      const list = pendingByUser.get(member.user_id) ?? [];
      list.push({
        routineId: doc._id, dueAt: routine.due_at, kind, channels,
        item: { name: routine.name, kind, dueAt: routine.due_at },
      });
      pendingByUser.set(member.user_id, list);
    }
  }

  for (const [userId, pending] of pendingByUser) {
    try {
      const digest = settingsByUser.get(userId)?.digest === true;
      if (digest && pending.length > 1) {
        const { title, message } = groupForDigest(pending.map((p) => p.item), now);
        const channels = [...new Set(pending.flatMap((p) => p.channels))];
        await notify(userId, { title, message, link: "/internal/xenroutine", icon: "event_repeat", channels });
      } else {
        await Promise.all(pending.map((p) => {
          const { title, message } = reminderMessage(p.item, now);
          return notify(userId, { title, message, link: "/internal/xenroutine", icon: "event_repeat", channels: p.channels });
        }));
      }

      // Conditional on due_at so a concurrent complete/postpone (which moves it) isn't
      // stamped as already notified.
      await Promise.all(pending.map((p) => XenRoutine.updateOne(
        { _id: p.routineId, due_at: p.dueAt, "members.user_id": userId },
        { $set: p.kind === "due"
          ? { "members.$.last_due_notified_at": now }
          : { "members.$.lead_notified_for": p.dueAt } },
      )));
    } catch (e) {
      console.error(`XenRoutine reminders failed for user ${userId}:`, e);
    }
  }
}

/** Tell the other members that someone completed or postponed a routine. Never throws. */
export async function sendActivityNotices(
  routine: { members: RoutineMember[] },
  actorId: string,
  actorName: string,
  text: string,
): Promise<void> {
  try {
    await Promise.all(activityRecipients(routine, actorId).map((r) =>
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
