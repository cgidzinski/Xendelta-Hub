import { isNotificationOn } from "@shared/notificationApps";
import { XenKitchenTimer } from "../models/xenKitchenTimer";
import { User } from "../models/user";
import { isPushConfigured, sendPushToUser } from "./pushUtils";

const PUSH_WINDOW_SECONDS = 30;
const BATCH_SIZE = 50;

export async function sendKitchenTimerAlerts(now = Date.now(), send = sendPushToUser): Promise<void> {
  const due = await XenKitchenTimer.find({ nextEventAt: { $lte: now } })
    .sort({ nextEventAt: 1 })
    .limit(BATCH_SIZE)
    .lean();
  await Promise.all(
    due.map(async (timer) => {
      try {
        if (timer.endAt == null || timer.nextEventAt == null) return;
        // On recovery, the completion takes precedence over a missed halfway alert.
        const finished = timer.endAt <= now;
        const eventAt = finished ? timer.endAt : timer.nextEventAt;
        const claim = await XenKitchenTimer.updateOne(
          { _id: timer._id, version: timer.version, nextEventAt: timer.nextEventAt },
          { $set: { nextEventAt: finished ? null : timer.endAt } },
        );
        if (claim.modifiedCount !== 1 || eventAt + PUSH_WINDOW_SECONDS * 1000 <= now) return;

        const user = await User.findById(timer.owner).select("notificationPrefs").lean();
        if (
          !user ||
          !isNotificationOn(
            {
              muted: user.notificationPrefs?.muted ?? [],
              emailApps: user.notificationPrefs?.emailApps ?? [],
            },
            "xenkitchen",
            "push",
          )
        )
          return;

        const expiresAt = Math.min(eventAt + PUSH_WINDOW_SECONDS * 1000, finished ? Infinity : timer.endAt);
        const ttl = Math.floor((expiresAt - Math.max(now, Date.now())) / 1000);
        if (ttl < 0) return;
        // A pause or dismissal between claiming and dispatch invalidates the claim.
        if (!(await XenKitchenTimer.exists({ _id: timer._id, version: timer.version }))) return;
        await send(
          timer.owner,
          {
            title: finished ? "Timer done" : "Halfway",
            body: timer.label,
            url: `/internal/xenkitchen?timer=${encodeURIComponent(timer.id)}`,
            tag: `xenkitchen:${timer.id}:${finished ? "done" : "halfway"}`,
          },
          { ttl, timeout: 5000 },
        );
      } catch (error) {
        console.error("XenKitchen timer push failed", error);
      }
    }),
  );
}

export async function runKitchenTimerAlerts(): Promise<void> {
  if (isPushConfigured()) await sendKitchenTimerAlerts();
}
